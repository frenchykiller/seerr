const fs = require('fs');
let content = fs.readFileSync('server/routes/auth.test.ts', 'utf-8');
content = content.replace(/describe\('OIDC Authentication'[\s\S]+/, '');

const testCode = `
import { Issuer } from 'openid-client';

describe('OIDC Authentication', () => {
  let app: Express;
  before(() => {
    mock.method(Issuer, 'discover', async () => ({
      Client: class Client {
        authorizationUrl() { return 'https://auth.url'; }
        callbackParams() { return {}; }
        async callback() { return { claims: () => ({ email: 'testoidc@example.com', groups: ['admin'] }) }; }
        async userinfo() { return { email: 'testoidc@example.com' }; }
      }
    }));
  });

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use(
      session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
      })
    );
    app.use('/api/v1/auth', authRoutes);
    
    app.use('/test-callback', (req, res, next) => {
      (req.session as any).oidcState = 'state';
      (req.session as any).oidcNonce = 'nonce';
      next();
    }, authRoutes);
    
    await setupTestDb();
  });

  it('should return OIDC enabled status', async () => {
    process.env.OIDC_ISSUER_URL = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = 'client_id';
    
    const response = await request(app).get('/api/v1/auth/oidc');
    assert.equal(response.status, 200);
    assert.equal(response.body.enabled, true);
  });
  
  it('should redirect to OIDC login', async () => {
    process.env.OIDC_ISSUER_URL = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = 'client_id';
    process.env.OIDC_CLIENT_SECRET = 'client_secret';
    
    const response = await request(app).get('/api/v1/auth/oidc/login');
    assert.equal(response.status, 302);
    assert.equal(response.headers.location, 'https://auth.url');
  });

  it('should handle OIDC callback', async () => {
    process.env.OIDC_ISSUER_URL = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = 'client_id';
    process.env.OIDC_CLIENT_SECRET = 'client_secret';
    process.env.OIDC_ADMIN_GROUP = 'admin';

    const response = await request(app).get('/test-callback/oidc/callback');
    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/');
    
    const userRepository = getRepository(User);
    const user = await userRepository.findOne({ where: { email: 'testoidc@example.com' } });
    assert.ok(user);
    assert.equal(user.email, 'testoidc@example.com');
  });
});
`;

content += testCode;
fs.writeFileSync('server/routes/auth.test.ts', content);
