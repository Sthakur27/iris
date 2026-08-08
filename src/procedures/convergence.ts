import { createVergenceProcedure } from './vergenceCore'

/**
 * Base-out demand: each eye's image shifts toward the other eye, so the eyes must
 * turn inward to fuse. This is the deficient direction in convergence insufficiency,
 * and the ladder climbs toward the prescribed goal (HTS's default is 35Δ).
 */
export const convergence = createVergenceProcedure({
  id: 'convergence',
  label: 'Convergence',
  goalPd: (p) => p.convergenceGoalPd,
  signedDemandPd: (_rep, magnitudePd) => magnitudePd,
  minRestMs: 0,
  instruction: 'Let the shape settle, then press the arrow key for where it is. Space if you cannot see it.',
})
