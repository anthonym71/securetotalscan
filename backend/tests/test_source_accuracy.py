"""Regression evidence for false positives and adjacent real hazards."""
from pathlib import Path
import pytest
from tools.github_scanner import scan_source_code
ROOT = Path(__file__).resolve().parents[2]
@pytest.mark.parametrize('path', ['backend/url_guard.py', 'lib/report/access.ts', 'lib/report/reportDoc.ts', 'lib/scanner/checks.ts', 'lib/scanner/htmlSinks.ts', 'lib/scanner/httpPosture.ts', 'lib/scanner/index.ts'])
def test_reported_false_positive_files(path):
    results = scan_source_code((ROOT/path).read_text(), path, 'Python' if path.endswith('.py') else 'TypeScript')
    assert not [f for f in results if not (path.endswith("httpPosture.ts") and f["line"] in (161, 172))], results

def test_test_token_retained_informational_redacted():
    findings = scan_source_code((ROOT/'backend/conftest.py').read_text(), 'backend/conftest.py', 'Python')
    assert len(findings) == 1
    assert findings[0]['severity'] == 'INFO'
    assert findings[0]['disposition'] == 'test_fixture'
    assert '0123456789' not in str(findings)

@pytest.mark.parametrize('code,language,expected', [
 ('// eval(x)\nconst x = eval(input);', 'JavaScript', 'Use of eval()'),
 ('/* el.innerHTML = x */\nel.innerHTML = input;', 'TypeScript', 'DOM XSS Risk'),
 ('// dangerouslySetInnerHTML\nconst x = <div dangerouslySetInnerHTML={{__html: input}} />;', 'TypeScript', 'React XSS Risk'),
 ('"""exec(user_input)"""\nexec(user_input)', 'Python', 'Use of exec()'),
 ('# password="ignored-value"\npassword="actual-sensitive-value"', 'Python', 'Hardcoded Secret'),
 ('const headers = {"Access-Control-Allow-Origin": "*"};', 'TypeScript', 'Permissive CORS'),
 ('const url = "http://external.example/api";', 'TypeScript', 'Insecure HTTP URL'),
 ('# cidr_blocks = ["0.0.0.0/0"]\ncidr_blocks = ["0.0.0.0/0"]', 'HCL', 'Open Ingress CIDR (0.0.0.0/0)'),
 ('child_process.exec(input)', 'JavaScript', 'Use of exec()'),
 ('subprocess.run(user_input, shell=True)', 'Python', 'Shell Injection Risk'),
])
def test_real_code_next_to_examples_detected(code, language, expected):
    findings = scan_source_code(code, 'app.py', language)
    assert any(f['name'] == expected for f in findings)
    assert all(f['verified'] is False for f in findings)

def test_multiple_occurrences_not_discarded():
    findings = scan_source_code('eval(a)\neval(b)\neval(c); eval(d)', 'app.js', 'JavaScript')
    assert len(findings) == 4
    assert [f['line'] for f in findings] == [1, 2, 3, 3]

def test_credentials_in_strings_not_blanket_ignored():
    token = 'ghp_' + 'a'*30
    findings = scan_source_code(f'const data = "{token}";', 'tests/fixture.ts', 'TypeScript')
    assert findings and findings[0]['name'] == 'Exposed Credential Pattern'
    assert token not in str(findings)

def test_multiline_comments_docstrings():
    assert scan_source_code('/*\n eval(input)\n innerHTML = input\n*/', 'a.ts', 'TypeScript') == []
    assert scan_source_code('def f():\n    """http://example.org\n    exec(input)\n    """\n    return 1', 'a.py', 'Python') == []

@pytest.mark.parametrize('code', [
    'query = "SELECT * FROM users WHERE name = " + name',
    'query = f"SELECT * FROM users WHERE name = {name}"',
    'query = "SELECT * FROM users WHERE name = %s" % name',
    'query = "SELECT * FROM users WHERE name = {}".format(name)',
])
def test_sql_interpolation_detected(code):
    assert any(f['name'] == 'SQL Injection Risk' for f in scan_source_code(code, 'a.py', 'Python'))

def test_sql_parameters_not_injection():
    assert not scan_source_code('cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))', 'a.py', 'Python')

def test_known_token_in_comment_still_reported_and_redacted():
    token = 'ghp_' + 'a' * 30
    results = scan_source_code('# ' + token, 'a.py', 'Python')
    assert results[0]['severity'] == 'CRITICAL'
    assert token not in str(results)

def test_real_token_in_test_variable_never_fixture():
    token = 'ghp_' + 'a' * 30
    results = scan_source_code(f'TEST_API_KEY = "{token}"', 'tests/a.py', 'Python')
    assert all(r['disposition'] == 'needs_review' for r in results)

def test_other_literal_cannot_downgrade():
    results = scan_source_code('const token="real-sensitive-value"; const label="test-fixture";', 'tests/a.ts', 'TypeScript')
    assert results[0]['disposition'] == 'needs_review'

def test_template_expression_executable():
    results = scan_source_code('const x = `text eval(fake) ${eval(input)}`;', 'a.ts', 'TypeScript')
    assert len(results) == 1
    assert results[0]['name'] == 'Use of eval()'

@pytest.mark.parametrize('path,language', [('a.json','JSON'), ('a.yml','YAML'), ('a.toml','TOML'), ('a.cfg','INI'), ('.env','INI')])
def test_config_language_does_not_inherit_repository(path,language):
    from tools.github_scanner import _guess_language
    assert _guess_language(path, {'Python':100}) == language

def test_json_cors_header():
    assert scan_source_code('{"Access-Control-Allow-Origin": "*"}', 'a.json','JSON')[0]['name'] == 'Permissive CORS'

def test_finding_safety_limit_fails_explicitly():
    from tools.github_scanner import FindingsLimitError, MAX_FINDINGS_PER_FILE
    with pytest.raises(FindingsLimitError):
        scan_source_code('eval(input);\n' * (MAX_FINDINGS_PER_FILE + 1), 'a.js', 'JavaScript')

def test_python_fstring_text_and_expression_separate():
    results = scan_source_code('x = f"eval(fake) {eval(input)}"', 'a.py', 'Python')
    assert len(results) == 1
    assert results[0]['name'] == 'Use of eval()'

def test_other_finding_on_secret_line_is_redacted():
    token = 'ghp_' + 'a'*30
    findings = scan_source_code(f'const token="{token}"; eval(input);', 'a.js', 'JavaScript')
    assert len(findings) >= 2
    assert token not in str(findings)

@pytest.mark.parametrize('path,language', [('.github/workflows/cd.yml', 'YAML'), ('scripts/sync-vercel-env.sh', 'Shell')])
def test_deployment_credential_references_not_literal_secrets(path,language):
    results = scan_source_code((ROOT/path).read_text(), path, language)
    assert not [r for r in results if r['name'] == 'Hardcoded Secret']

@pytest.mark.parametrize('value', ['$TOKEN', '${TOKEN}', '${{ secrets.TOKEN }}'])
def test_whole_environment_reference(value):
    assert not scan_source_code(f'--token="{value}"', 'a.yml', 'YAML')

def test_secret_literal_or_default_still_detected():
    assert scan_source_code('TOKEN="${TOKEN:-real-secret-value}"', 'a.sh', 'Shell')
    assert scan_source_code("TOKEN='$TOKEN_IS_LITERAL'", 'a.sh', 'Shell')
    assert scan_source_code('token="a-real-secret-value"', 'a.sh', 'Shell')

def test_neon_migration_tag_remains_reviewable():
    findings = scan_source_code((ROOT/'scripts/migrate.ts').read_text(), 'scripts/migrate.ts', 'TypeScript')
    sql = [r for r in findings if r['name'] == 'SQL Injection Risk']
    assert sql and all(r['confidence'] == 'low' for r in sql)
    assert all('parameterized tags may be safe' in r['recommendation'] for r in sql)

@pytest.mark.parametrize('code,expected', [
 ('import { neon } from "@neondatabase/serverless"; const sql=neon(url); sql`SELECT id FROM users WHERE id=${input}`', True),
 ('import { neon as connect } from "@neondatabase/serverless"; const db=connect(url); db`SELECT id FROM users WHERE id=${input}`', True),
 ('const sql=other(url); sql`SELECT id FROM users WHERE id=${input}`', True),
 ('import { neon } from "@neondatabase/serverless"; const sql=neon(url); const query=`SELECT id FROM users WHERE id=${input}`;', True),
 ('import { neon } from "@neondatabase/serverless"; const sql=neon(url); function f(sql) { sql`SELECT id FROM users WHERE id=${input}`; }', True),
 ('import { neon } from "@neondatabase/serverless"; { const sql=neon(url); } sql`SELECT id FROM users WHERE id=${input}`;', True),
 ('import { neon } from "@neondatabase/serverless"; const sql=neon(url); ((sql)=>sql`SELECT id FROM users WHERE id=${input}`)(unsafe);', True),
])
def test_all_sql_tags_remain_reviewable(code,expected):
    findings = scan_source_code(code,'a.ts','TypeScript')
    assert bool([r for r in findings if r['name'] == 'SQL Injection Risk']) is expected

def test_neon_factory_parameter_shadow_not_exempt():
    code = 'import { neon } from "@neondatabase/serverless"; function f(neon) { const sql=neon(url); sql`SELECT id FROM users WHERE id=${input}`; }'
    assert any(r['name'] == 'SQL Injection Risk' for r in scan_source_code(code,'a.ts','TypeScript'))

@pytest.mark.parametrize('code', [
    '''const text="import { neon } from '@neondatabase/serverless'"; const sql=neon(url); sql`SELECT id FROM x WHERE id=${input}`''',
    '''import { neon } from '@neondatabase/serverless'; const sql=neon(url); evil.sql`SELECT id FROM x WHERE id=${input}`''',
    '''import { neon } from '@neondatabase/serverless'; function f(){const {neon}=other; const sql=neon(url); sql`SELECT id FROM x WHERE id=${input}`;}''',
    '''import { neon } from '@neondatabase/serverless'; const sql=neon(url) && unsafe; sql`SELECT id FROM x WHERE id=${input}`''',
])
def test_unproven_neon_binding_cannot_hide_injection_candidate(code):
    results = scan_source_code(code, 'a.ts', 'TypeScript')
    assert any(r['name'] == 'SQL Injection Risk' and r['disposition'] == 'needs_review' for r in results)

@pytest.mark.parametrize('language', ['INI', 'HCL', 'YAML'])
def test_configuration_dollar_literal_remains_reviewable(language):
    assert scan_source_code('TOKEN="$TOKEN_HAS_LONG_NAME"', 'a.cfg', language)
