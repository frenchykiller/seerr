const fs = require('fs');
const content = fs.readFileSync('server/routes/auth.ts', 'utf-8');
const oidcCode = `

import { Issuer, generators } from 'openid-client';

let oidcClient: any;
async function getOidcClient() {
  if (oidcClient) return oidcClient;
  if (!process.env.OIDC_ISSUER_URL) return null;
  const issuer = await Issuer.discover(process.env.OIDC_ISSUER_URL);
  oidcClient = new issuer.Client({
    client_id: process.env.OIDC_CLIENT_ID!,
    client_secret: process.env.OIDC_CLIENT_SECRET!,
    redirect_uris: [process.env.OIDC_REDIRECT_URI || \`\${getHostname()}/api/v1/auth/oidc/callback\`],
    response_types: ['code'],
  });
  return oidcClient;
}

authRoutes.get('/oidc', (req, res) => {
  res.json({
    enabled: !!process.env.OIDC_ISSUER_URL && !!process.env.OIDC_CLIENT_ID
  });
});

authRoutes.get('/oidc/login', async (req, res) => {
  const client = await getOidcClient();
  if (!client) return res.status(400).send('OIDC not configured');
  const nonce = generators.nonce();
  const state = generators.state();
  
  if (!req.session) {
    return res.status(500).send('Session not initialized');
  }
  
  req.session.oidcState = state;
  req.session.oidcNonce = nonce;
  // wait, the session type won't have oidcState and oidcNonce, we can just cast it
  // Actually in typescript req.session will complain, we can cast to any
  (req.session as any).oidcState = state;
  (req.session as any).oidcNonce = nonce;

  const url = client.authorizationUrl({
    scope: 'openid email profile groups',
    state,
    nonce,
  });
  res.redirect(url);
});

authRoutes.get('/oidc/callback', async (req, res, next) => {
  try {
    const client = await getOidcClient();
    if (!client) return res.status(400).send('OIDC not configured');
    
    const params = client.callbackParams(req);
    const tokenSet = await client.callback(
      process.env.OIDC_REDIRECT_URI || \`\${getHostname()}/api/v1/auth/oidc/callback\`,
      params,
      { state: (req.session as any).oidcState, nonce: (req.session as any).oidcNonce }
    );
    
    let claims = tokenSet.claims();
    
    if (!claims.email) {
      try {
        const userinfo = await client.userinfo(tokenSet.access_token!);
        claims = { ...claims, ...userinfo };
      } catch (e: any) {
        logger.warn('Failed to fetch userinfo', { error: e.message });
      }
    }
    
    const emailKey = process.env.OIDC_CLAIM_EMAIL_KEY || 'email';
    const email = claims[emailKey] as string;
    if (!email) {
      return res.status(400).send('OIDC login failed: missing email claim');
    }
    
    const groupsKey = process.env.OIDC_CLAIM_GROUPS_KEY || 'groups';
    const groups = (claims[groupsKey] || []) as string[];
    const adminGroup = process.env.OIDC_ADMIN_GROUP;
    const userGroup = process.env.OIDC_USER_GROUP;
    
    let isAdmin = adminGroup ? groups.includes(adminGroup) : false;
    let isUser = userGroup ? groups.includes(userGroup) : true;
    
    if (adminGroup && !isAdmin && userGroup && !isUser) {
      return res.status(403).send('Unauthorized group');
    }
    
    const userRepository = getRepository(User);
    let user = await userRepository.findOne({ where: { email } });
    const settings = getSettings();
    
    if (!user) {
      user = new User({
        email,
        username: claims.preferred_username || claims.name || email.split('@')[0],
        permissions: isAdmin ? Permission.ADMIN : settings.main.defaultPermissions,
        userType: UserType.LOCAL,
      });
      user.avatar = getUserAvatarUrl(user);
      await userRepository.save(user);
    } else {
      let permissionsChanged = false;
      if (isAdmin && !(user.permissions & Permission.ADMIN)) {
        user.permissions |= Permission.ADMIN;
        permissionsChanged = true;
      }
      if (permissionsChanged) {
        await userRepository.save(user);
      }
    }
    
    req.session.userId = user.id;
    res.redirect('/');
  } catch (err: any) {
    logger.error('OIDC callback error', { error: err.message });
    res.status(500).send('OIDC authentication failed');
  }
});
`;
const newContent = content.replace('export default authRoutes;', oidcCode + '\nexport default authRoutes;');
fs.writeFileSync('server/routes/auth.ts', newContent);
