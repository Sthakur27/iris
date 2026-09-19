# Why Iris exists

Recorded September 19, 2026, from Sid's account in the September 16–19 project
conversation. This document preserves the personal history and product motivation
behind Iris so future work can return to them. It is not a clinical evaluation or
a claim of treatment efficacy. See the [README](../README.md) for current behavior.

## The problem was personal

Sid reports being diagnosed with both accommodative and convergence insufficiency.
At the time of this conversation, he had been attending vision therapy for about
two months. His program included in-office work and at-home exercises using tools
such as HTS, red/blue glasses, and flippers.

Computer work was where the problem mattered most. Sid described his left eye as
feeling out of focus at monitor distance, including previously remaining blurry
when he covered his right eye. His right eye felt strained, as though it was doing
the heavy lifting. After looking away from the screen, that eye could feel fatigued
or stuck focusing up close. These are his descriptions of the experience, not
measurements of how much each eye contributed or a diagnosis of its mechanism.

His frustration with existing tools went beyond their dated software. He felt
that the standard exercises worked on accommodation and convergence, but that
getting better at those exercises did not automatically translate into comfortable
computer use. In his words, it felt like the skills were being developed
"in a vacuum."

That perceived gap between practice and everyday use is central to Iris. The
motivation is to make something that helps with the experience of using his eyes
throughout the day, not merely to give existing exercises a newer interface.

## Depth Rings is the reason to pursue it

Depth Rings is the strongest personal reason Sid wants to develop Iris into a
product. He developed the exercise through his own experimentation rather than
receiving that specific exercise from HTS or his therapy program. He later
recognized its similarity to the vectogram used in his in-office sessions.

The distinction he wants to preserve is that the presentation may be the
contribution. He is not claiming to have invented a new clinical principle.
Whether the implementation itself is novel has not been established.

What matters to him about the presentation:

- **Still, thin circles.** Small perceived mismatches are conspicuous against the
  simple contours. He described this as "pixel-perfect fusion": a description of
  how precise the feedback feels, not a measurement of eye alignment.
- **A calm visual experience.** Looking at the rings feels almost hypnotic and
  relaxing. That quality is part of the appeal, not incidental decoration.
- **Depth on his actual work screen.** The exercise lives on the computer where
  he spends much of his day and experiences the difficulty.
- **Relief that he notices afterward.** After looking away, he reports that the
  world looks unusually crisp and three-dimensional and that his eyes and brain
  feel comfortable. More recently, he has also reported that the left eye is clear
  when viewed alone, where it previously was not.

His description captures the motivation better than a proposed mechanism:

> "My brain and my eyes feel good when I do this, and when I look away,
> everything looks ... crisp and 3D, and I just feel a lot of relief."

Sid experiences the benefit as substantial. The conversation does not establish
how long it lasts, which changes are attributable specifically to Depth Rings
rather than the broader therapy program, or whether others would benefit.

## Depth Cinema and the broader exploration

Sid identifies both Depth Rings and Depth Cinema as growing out of his own
experience. They explore different presentations of binocular depth within Iris.
The detailed symptom and relief account above was specifically about Depth Rings;
the conversation did not establish an equally detailed origin story or separate
benefit report for Depth Cinema. Future notes should fill that in from Sid's
account rather than assume the two exercises have identical effects.

At the time of writing, the implementation distinguishes them as follows:

- [Depth Rings](../src/procedures/depthRings.ts) presents six concentric rings with
  adjustable stack depth and depth spread, with optional slow automatic sweeps.
  Its still presentation is the quality Sid emphasized, even though the controls
  also support changing depth over time.
- [Depth Cinema](../src/procedures/depthCinema.ts) presents an animated binocular
  scene with adjustable depth and motion. It provides controls to pause motion
  and hold depth. It is an experimental continuous experience, without a scored
  answer channel or a measured clinical threshold.

These are related product explorations, not evidence that either treats both
accommodative and convergence insufficiency. The display presents binocular depth
cues; its optical focus demand remains tied to the physical screen.

## Everyday use is part of the idea

Sid has experimented with using the rings across monitors and viewing them
slightly off-center or at slight angles. His reasoning is practical: everyday
computer work does not always happen facing a single target straight ahead.
These observations motivate questions about carryover into ordinary work; they
do not establish an off-axis training protocol.

The current rendering uses stored screen calibration and viewing distance. It
does not track head position or automatically account for another monitor's
geometry. Moving between displays or viewing positions can therefore change the
actual demand without a corresponding change in the displayed setting.

Mobile is a further direction Sid wants to explore because phones are another
common setting for close visual work. This is an investigation to pursue, not a
reported mobile benefit. Smaller screens, viewing distance, calibration, and the
glasses setup need consideration; shrinking the desktop layout alone would not
establish an equivalent experience.

## What this means for building the product

The reason to productionize Iris is to make this personally useful experience
reliable, understandable, and available to explore with other people and clinicians.
The following principles are derived from Sid's account:

1. Preserve what makes the rings useful to him: precise-looking contours,
   simplicity, calmness, and control over depth. More animation or gamification
   should not automatically be treated as an improvement.
2. Treat comfort during ordinary computer use and relief afterward as important
   outcomes to investigate, alongside performance within an exercise.
3. Keep the workstation context central. It is where Sid's symptoms affected his
   life and where he found the experience valuable.
4. Distinguish personal benefit, design hypotheses, and demonstrated clinical
   outcomes. "Extremely effective for me at relieving symptoms" records a different
   claim from "an effective treatment for other patients."
5. Seek clinical collaboration to understand the experience. Sid began preparing
   an introduction to a college friend's ophthalmologist father to demonstrate
   the exercise and get a clinician's perspective; no resulting consultation is
   recorded here.

Useful open questions include how long relief persists, whether it makes a
subsequent work session easier, how it compares with the in-office vectogram or a
visual break, and what a clinician can measure before and after use. The product
should not turn subjective clarity into a claim that it measures alignment,
equal contribution from both eyes, suppression, or accommodation.

The starting point remains simple: Sid made something that feels substantially
helpful in the setting where he struggles most. Understanding that experience,
preserving its useful qualities, and finding out whether it can help others are
the reasons to keep building Iris.
