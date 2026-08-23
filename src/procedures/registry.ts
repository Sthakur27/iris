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
  ].map((p) => [p.id, p]),
)
