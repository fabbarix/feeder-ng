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
    adminMeta: 'Admin',
    notSignedIn: 'Not signed in yet',
    adminLabel: 'Admin',
    confirm: 'Confirm',
    removeButton: 'Remove',
    remove: (email: string) => `Remove ${email}`,
    confirmRemoveTitle: (email: string) => `Remove ${email}?`,
    confirmRemoveBody: 'They will no longer be able to sign in. Their own data stays.',
    cancel: 'Cancel',
    askToJoinHint: 'People can also ask to join. Their requests wait in',
    signInRequests: 'Sign-in requests',
    // SET-03: telling a newly allowed person where and how to sign in (GLOSSARY: never "invite" or "account").
    share: (email: string) => `Share sign-in message for ${email}`,
    copy: (email: string) => `Copy sign-in message for ${email}`,
    more: (email: string) => `More for ${email}`,
    copyItem: 'Copy sign-in message',
    shareAction: 'Share sign-in message',
    added: (email: string) => `${email} can sign in now`,
    addedSubline: 'Send them where and how to sign in.',
    copied: 'Sign-in message copied',
    shareDidNotOpen: 'The share sheet did not open.',
    sheetTitle: 'Sign-in message',
    sheetHelper: 'Select the text and copy it.',
    done: 'Done',
    /** SET-03: the message itself (lib/allowlist signInMessage and sharePayload). */
    message: {
      lead: "You can now sign in to Feeder, our Household's meal planner.",
      open: (origin: string, email: string) => `Open ${origin} and choose "Continue with Google", then use ${email}.`,
      choose: (email: string) => `Choose "Continue with Google" and use ${email}.`,
      shareTitle: 'Sign in to Feeder',
    },
  },
}
