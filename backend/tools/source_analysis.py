"""Small lexical evidence filter, not a parser or proof of exploitability.

Offsets/newlines are preserved. Python tokenization handles comments and AST
identifies docstrings; other languages use conservative quote/comment lexing.
Runtime strings remain available to credential/configuration rules.
"""
import ast
from bisect import bisect_right
import io
import re
import tokenize
from dataclasses import dataclass


@dataclass
class SourceView:
    text: str  # comments/docstrings blanked, literals retained
    code: str  # literals also blanked
    strings: list[tuple[int, int]]

    def __post_init__(self):
        self.strings.sort()
        self.string_starts = [start for start, _ in self.strings]


def _blank(chars: list[str], start: int, end: int) -> None:
    for i in range(start, min(end, len(chars))):
        if chars[i] not in "\r\n":
            chars[i] = " "


def source_view(content: str, language: str) -> SourceView:
    text, code = list(content), list(content)
    strings = []
    if language == "Python":
        starts = [0]
        starts.extend(m.end() for m in re.finditer("\n", content))
        def offset(pos):
            return starts[min(pos[0] - 1, len(starts) - 1)] + pos[1]
        try:
            for token in tokenize.generate_tokens(io.StringIO(content).readline):
                start, end = offset(token.start), offset(token.end)
                if token.type == tokenize.COMMENT:
                    _blank(text, start, end)
                    _blank(code, start, end)
                elif token.type in {getattr(tokenize, "FSTRING_START", -1), getattr(tokenize, "FSTRING_MIDDLE", -2), getattr(tokenize, "FSTRING_END", -3)}:
                    strings.append((start, end))
                    _blank(code, start, end)
                elif token.type == tokenize.STRING:
                    strings.append((start, end))
                    _blank(code, start, end)
        except (tokenize.TokenError, IndentationError, SyntaxError):
            pass  # retain unprocessed source: never silently declare it safe
        try:
            tree = ast.parse(content)
            for node in ast.walk(tree):
                if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.body:
                    first = node.body[0]
                    if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                        # AST columns are UTF-8 byte offsets; convert to characters.
                        rows = content.splitlines(keepends=True)
                        def ast_offset(line, col):
                            return starts[line - 1] + len(rows[line - 1].encode()[:col].decode())
                        start = ast_offset(first.lineno, first.col_offset)
                        end = ast_offset(first.end_lineno, first.end_col_offset)
                        _blank(text, start, end)
                        _blank(code, start, end)
        except (SyntaxError, ValueError):
            pass
    else:
        hash_comments = language in {"Shell", "Ruby", "HCL", "YAML", "TOML", "INI"}
        slash_comments = language not in {"SQL", "Shell", "YAML", "TOML", "INI", "JSON"}
        i = 0
        while i < len(content):
            start = i
            if (hash_comments and content[i] == "#") or (slash_comments and content.startswith("//", i)) or (language == "SQL" and content.startswith("--", i)):
                end = content.find("\n", i)
                i = len(content) if end < 0 else end
                _blank(text, start, i)
                _blank(code, start, i)
            elif slash_comments and content.startswith("/*", i):
                end = content.find("*/", i + 2)
                i = len(content) if end < 0 else end + 2
                _blank(text, start, i)
                _blank(code, start, i)
            elif language in {"JavaScript", "TypeScript"} and content[i] == "/" and re.search(r"(?:[=(:,!\[;?{}]|\breturn)\s*$", content[max(0, i - 100):i]):
                # JS regex literal: quotes inside character classes are not strings.
                i += 1
                in_class = False
                while i < len(content) and content[i] != "\n":
                    if content[i] == "\\":
                        i += 2
                        continue
                    if content[i] == "[":
                        in_class = True
                    elif content[i] == "]":
                        in_class = False
                    elif content[i] == "/" and not in_class:
                        i += 1
                        break
                    i += 1
                strings.append((start, min(i, len(content))))
                _blank(code, start, i)
            elif content[i] in "\"'`":
                quote = content[i]
                i += 1
                while i < len(content):
                    if content[i] == "\\":
                        i += 2
                    elif content[i] == quote:
                        i += 1
                        break
                    else:
                        i += 1
                strings.append((start, min(i, len(content))))
                _blank(code, start, i)
            else:
                i += 1
    if language in {"JavaScript", "TypeScript"}:
        # Template interpolation is executable code, unlike surrounding text.
        expanded = []
        for start, end in strings:
            if content[start:start + 1] != "`":
                expanded.append((start, end))
                continue
            segment = start
            cursor = start + 1
            while cursor < end:
                if content[cursor] == "\\":
                    cursor += 2
                    continue
                if not content.startswith("${", cursor):
                    cursor += 1
                    continue
                expression = cursor + 2
                finish = _expression_end(content, expression, end)
                expanded.append((segment, expression))
                inner = source_view(content[expression:finish], language)
                text[expression:finish] = inner.text
                code[expression:finish] = inner.code
                expanded.extend((expression + a, expression + b) for a, b in inner.strings)
                segment = finish
                cursor = finish + 1
            expanded.append((segment, end))
        strings = expanded
    return SourceView("".join(text), "".join(code), strings)


def _expression_end(content: str, start: int, limit: int) -> int:
    depth, i = 1, start
    while i < limit:
        if content.startswith("//", i):
            newline = content.find("\n", i)
            i = limit if newline < 0 else newline
            continue
        if content.startswith("/*", i):
            close = content.find("*/", i + 2)
            i = limit if close < 0 else close + 2
            continue
        char = content[i]
        if char in "\"'`":
            quote = char
            i += 1
            while i < limit:
                if content[i] == "\\":
                    i += 2
                elif content[i] == quote:
                    i += 1
                    break
                else:
                    i += 1
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return limit



def literal_at(view: SourceView, position: int):
    index = bisect_right(view.string_starts, position) - 1
    if index >= 0 and position < view.strings[index][1]:
        return view.strings[index]
    return None


def accepts_match(view: SourceView, match: re.Match, name: str, language: str) -> bool:
    """Keep code syntax separate from mentions of syntax inside strings."""
    start = match.start()
    literal = literal_at(view, start)
    if name == "Exposed Credential Pattern":
        return True  # known token shapes remain sensitive even inside a string
    if name in {"Hardcoded Secret", "Hardcoded Secret in Terraform"}:
        assignment = re.search(r"=\s*([\"'])(.*?)\1", match.group())
        if assignment:
            value = assignment.group(2)
            # Recognize a whole variable reference only; defaults/mixed literal
            # material can still embed credentials and remain reviewable.
            expansion = re.fullmatch(r"\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\}|\{\{\s*(?:secrets|env)\.[A-Za-z_][A-Za-z0-9_]*\s*\}\})", value)
            if expansion and assignment.group(1) == '"' and (language == "Shell" or (language == "YAML" and view.text[max(0, match.start() - 2):match.start()] == "--")):
                return False
    if name == "Insecure HTTP URL":
        # Runtime URL literals, not prose evidence mentioning a URL.
        if literal is None:
            return False
        prefix = view.text[literal[0]:start]
        if language == "Python" and prefix.lower().startswith("r"):
            return False  # regular-expression pattern, not an outbound URL
        return not prefix.strip("frbuFRBU\"'` ")
    if name == "SQL Injection Risk":
        if literal is None:
            # Python 3.12+ tokenizes f-strings as FSTRING_* rather than STRING.
            prefix = view.text[max(0, start - 4):start]
            return language == "Python" and bool(re.search(r"(?i)f[\"']$", prefix)) and "{" in match.group()
        value = view.text[literal[0]:literal[1]]
        tail = view.text[literal[1]:].lstrip()
        # Parameter placeholders are safe by themselves. Flag interpolation or
        # concatenation at the string boundary, not mere SQL vocabulary.
        prefix = view.text[max(0, literal[0] - 4):literal[0]]
        return (language == "Python" and bool(re.search(r"(?i)f[\"']$", prefix)) and tail.startswith("{")
                or bool(re.match(r"(?i)[rub]*f", value)) and "{" in value
                or value.startswith("`") and "${" in value
                or bool(re.match(r"(?:\+|%|\.format\s*\()", tail)))
    if name == "Permissive CORS":
        # Quoted object/dict keys or header setters; not a whole evidence string.
        if literal:
            key = view.text[literal[0]:literal[1]].strip("\"'")
            return key.lower() == "access-control-allow-origin"
        return True
    if literal:
        return False
    if name == "Use of exec()":
        if language == "Python":
            return not view.text[max(0, start - 100):start].rstrip().endswith(".")
        if language in {"JavaScript", "TypeScript"}:
            prefix = view.code[max(0, start - 100):start].rstrip()
            # .exec is typically RegExp; known process receivers are retained.
            return not prefix.endswith(".") or bool(re.search(r"(?:child_process|childProcess)\.$", prefix))
        return language in {"PHP", "Ruby"}
    return True
