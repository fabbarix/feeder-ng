// English copy for Settings, the Allowlist page. Glossary terms only. Re-exported as part of settingsStrings by ../strings.ts.
export const settingsAllowlistStrings = {
  allowlistAdminOnly: 'Only an Admin can see the Allowlist.',

  allowlistPanel: {
    emailLabel: 'Email to allow',
    add: 'Add to allowlist',
    you: '(you)',
    youMeta: 'You',
    admin: (email: string) => `Admin: ${email}`,
    lastAdmin: 'Last Admin',
    adminLabel: 'Admin',
    confirm: 'Confirm',
    removeButton: 'Remove',
    remove: (email: string) => `Remove ${email}`,
    confirmRemoveTitle: (email: string) => `Remove ${email}?`,
    confirmRemoveBody: 'They will no longer be able to sign in. Their own data stays.',
    cancel: 'Cancel',
    askToJoinHint: 'People can also ask to join. Their requests wait in',
    signInRequests: 'Sign-in requests',
  },
}
