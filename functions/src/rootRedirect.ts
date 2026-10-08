export interface RootRedirectResult {
  status: number;
  location: string | null;
}

// The redirect target is deployment-specific (functions/.env, gitignored),
// not hardcoded, so this codebase stays generic across deployments.
export function resolveRootRedirect(): RootRedirectResult {
  const destination = process.env.ROOT_REDIRECT_URL;
  if (!destination) {
    return { status: 500, location: null };
  }
  return { status: 302, location: destination };
}
