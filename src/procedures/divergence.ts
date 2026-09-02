import { createVergenceProcedure } from './vergenceCore'

/**
 * Base-in demand: the eyes must turn outward to fuse. Physiological divergence range
 * is far smaller than convergence range, which is why the goal defaults to 13Δ against
 * convergence's 35Δ — the ladder is not comparable between the two procedures.
 */
export const divergence = createVergenceProcedure({
  id: 'divergence',
  label: 'Divergence',
  axes: ['divergence'],
  axis: () => 'divergence',
  goalPd: (_axis, p) => p.divergenceGoalPd,
  minRestMs: 0,
  instruction: 'Let the shape settle, then press the arrow key for where it is. Space if you cannot see it.',
})
