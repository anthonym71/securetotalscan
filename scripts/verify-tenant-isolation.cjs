const fs=require("node:fs");

function must(path,patterns){
  const text=fs.readFileSync(path,"utf8");
  for(const [label,re] of patterns){
    if(!re.test(text)) throw new Error(`${path}: missing tenant-isolation invariant: ${label}`);
  }
  return text;
}

const db=must("lib/db/sites.ts",[
  ["site reads join customer",/FROM site s[\s\S]*JOIN customer c ON c\.id=s\.customer_id[\s\S]*lower\(c\.email\)=lower\(\$1\)/],
  ["site delete checks customer ownership",/DELETE FROM site s USING customer c[\s\S]*s\.customer_id=c\.id[\s\S]*lower\(c\.email\)=lower\(\$1\)/],
  ["history scopes customer",/FROM scan sc JOIN customer c ON c\.id=sc\.customer_id[\s\S]*lower\(c\.email\)=lower\(\$1\)/],
]);
if(/customerId\s*[:=]/.test(fs.readFileSync("app/api/account/sites/route.ts","utf8"))){
  throw new Error("sites route must not accept a caller-supplied customerId");
}
for(const route of ["app/api/account/sites/route.ts","app/api/account/history/route.ts"]){
  const text=must(route,[["session-derived identity",/verifySession|sessionFor/],["session email",/session\.email/]]);
  if(/searchParams\.get\(["']customer/i.test(text)||/body\.customer/i.test(text)){
    throw new Error(`${route}: caller-controlled customer identity detected`);
  }
}
console.log("Tenant isolation verification passed.");
