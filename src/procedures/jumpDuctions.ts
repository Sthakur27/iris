import { createVergenceProcedure } from './vergenceCore'

/**
 * The phasic trainer, and clinically the most important of the three.
 *
 * Successive reps alternate between a convergence and a divergence demand, so every
 * rep is a step change rather than a slow ramp. That matters because vergence has two
 * subsystems: a fast phasic pulse that grabs fusion, and a slow tonic integrator that
 * holds it. Convergence insufficiency specifically impairs the phasic response, and
 * only a step stimulus recruits it — a smooth ramp lets tonic adaptation quietly do
 * the work, which is why the enforced reset below is not optional here.
 *
 * Convergence and divergence have independent ladders. Their physiological ranges
 * differ, and progress (or a missed response) in one direction must not silently
 * move the other direction too.
 */
export const jumpDuctions = createVergenceProcedure({
  id: 'jumpDuctions',
  label: 'Jump Ductions',
  axes: ['convergence', 'divergence'],
  axis: (rep) => (rep % 2 === 0 ? 'convergence' : 'divergence'),
  goalPd: (axis, p) =>
    axis === 'convergence' ? p.convergenceGoalPd : p.divergenceGoalPd,
  // Enforced regardless of the user's rest setting: without a return to baseline
  // between reps, the next demand is not a step and the procedure trains nothing.
  minRestMs: 600,
  instruction:
    'The demand jumps between near and far each turn. Let it settle, then press the arrow key. Space if you cannot see it.',
})
