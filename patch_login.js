const fs = require('fs');
let content = fs.readFileSync('src/components/Login/index.tsx', 'utf-8');

const useSwrPatch = `
  const { data: oidcData } = useSWR<{ enabled: boolean }>('/api/v1/auth/oidc', {
    revalidateOnFocus: false,
  });
`;
content = content.replace(
  "const { data: backdrops } = useSWR<string[]>('/api/v1/backdrops'",
  useSwrPatch + "\n  const { data: backdrops } = useSWR<string[]>('/api/v1/backdrops'"
);

const buttonCode = `
  const oidcLoginButton = oidcData?.enabled ? (
    <Button
      key="oidc"
      data-testid="oidc-login-button"
      className="flex-1 bg-transparent"
      onClick={() => {
        window.location.href = '/api/v1/auth/oidc/login';
      }}
    >
      <span>Login with OIDC</span>
    </Button>
  ) : null;
`;

content = content.replace("const mediaServerName =", buttonCode + "\n  const mediaServerName =");

content = content.replace(
  "].filter((o): o is JSX.Element => !!o);",
  "  oidcLoginButton,\n  ].filter((o): o is JSX.Element => !!o);"
);

fs.writeFileSync('src/components/Login/index.tsx', content);
