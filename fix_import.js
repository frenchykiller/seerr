const fs = require('fs');
let content = fs.readFileSync('server/routes/auth.ts', 'utf-8');
content = content.replace("import { Issuer, generators } from 'openid-client';", "");
content = "import { Issuer, generators } from 'openid-client';\n" + content;
fs.writeFileSync('server/routes/auth.ts', content);
