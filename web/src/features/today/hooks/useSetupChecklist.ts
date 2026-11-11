import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { setupChecklist, type SetupChecklist, type SetupStep } from '../lib/setup'
import { useSetupFacts } from '../setupSeam'

/** The first-run checklist from the Household's facts, and where a step's action goes. */
export function useSetupChecklist(): { checklist: SetupChecklist; loading: boolean; goTo: (step: SetupStep) => void } {
  const { facts, loading } = useSetupFacts()
  const navigate = useNavigate()
  const checklist = useMemo(() => setupChecklist(facts), [facts])
  return { checklist, loading, goTo: (step) => navigate(step.to) }
}
