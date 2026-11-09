// Voice commands for Cook Mode. Plain TypeScript, no React.

export type VoiceCommand = 'next' | 'back' | 'repeat' | 'startTimer' | 'pauseTimer'

/**
 * Maps what the speech recogniser heard to a command, or null. Case,
 * surrounding space and trailing punctuation are ignored. Accepted phrases:
 * next / next step -> next; back / go back / previous / previous step -> back;
 * repeat / again / say again -> repeat; start timer / start the timer -> startTimer;
 * pause timer / pause the timer -> pauseTimer. A phrase that merely contains a
 * command word inside a longer sentence ("I will go back to the shop") is not a command.
 */
export function parseCommand(_transcript: string): VoiceCommand | null {
  throw new Error('TODO')
}
