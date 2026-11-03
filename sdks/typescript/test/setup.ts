// Unit tests never read the developer's real credentials or target: each test sets what it needs.
for (const name of ["MAITENTO_API_KEY", "MAITENTO_BASE_URL", "MAITENTO_NAMESPACE"]) {
  delete process.env[name];
}
