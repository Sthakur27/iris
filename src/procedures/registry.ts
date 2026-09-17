import type { ProcedureId } from '../core/types'
import type { Procedure } from './base'
import { convergence } from './convergence'
import { divergence } from './divergence'
import { jumpDuctions } from './jumpDuctions'
import { accommodativeRock } from './accommodativeRock'
import { pursuits } from './pursuits'
import { saccades } from './saccades'
import { cyclopeanLetters } from './cyclopeanLetters'
import { depthCinema } from './depthCinema'
import { depthRings } from './depthRings'
import { depthSpiral } from './depthSpiral'
import { depthHelix } from './depthHelix'

/** Passive depth scenes never emit response trials, so they have no hit effects. */
export const PROCEDURE_HIT_FEEDBACK: Record<ProcedureId, boolean> = {
  convergence: true,
  divergence: true,
  jumpDuctions: true,
  accommodativeRock: true,
  pursuits: true,
  saccades: true,
  cyclopeanLetters: true,
  depthCinema: false,
  depthRings: false,
  depthSpiral: false,
  depthHelix: false,
}

/** Single place the session runner resolves a plan step to an implementation. */
export const PROCEDURE_REGISTRY: Map<ProcedureId, Procedure> = new Map(
  [
    convergence,
    divergence,
    jumpDuctions,
    accommodativeRock,
    pursuits,
    saccades,
    cyclopeanLetters,
    depthCinema,
    depthRings,
    depthSpiral,
    depthHelix,
  ].map((p) => [p.id, p]),
)
