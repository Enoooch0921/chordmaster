/** Shared interaction timings, in seconds. No motion is applied to score content. */
export const UI_EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const UI_DRAWER_EASE = [0.32, 0.72, 0, 1] as const;
export const UI_CONTENT_FADE_DURATION = 0.125;
export type UiMotionPreference = { reduced: boolean; instant: boolean };
const duration = (preference: UiMotionPreference, normal: number) => preference.instant ? 0 : preference.reduced ? 0.125 : normal;
const surfaceTransition = (preference: UiMotionPreference, normal: number, ease: typeof UI_EASE_OUT | typeof UI_DRAWER_EASE = UI_EASE_OUT) => ({
  duration: duration(preference, normal), ease,
  transform: { duration: preference.reduced ? 0 : duration(preference, normal), ease }
});

export const popoverVariants = {
  hidden: ({ reduced }: UiMotionPreference) => ({ opacity: 0, transform: reduced ? 'none' : 'scale(0.97)' }),
  visible: (preference: UiMotionPreference) => ({ opacity: 1, transform: preference.reduced ? 'none' : 'scale(1)', transition: surfaceTransition(preference, 0.16) }),
  exit: (preference: UiMotionPreference) => ({ opacity: 0, transform: preference.reduced ? 'none' : 'scale(0.97)', transition: surfaceTransition(preference, 0.125) })
};
export const modalVariants = {
  hidden: ({ reduced }: UiMotionPreference) => ({ opacity: 0, transform: reduced ? 'none' : 'scale(0.97)' }),
  visible: (preference: UiMotionPreference) => ({ opacity: 1, transform: preference.reduced ? 'none' : 'scale(1)', transition: surfaceTransition(preference, 0.2) }),
  exit: (preference: UiMotionPreference) => ({ opacity: 0, transform: preference.reduced ? 'none' : 'scale(0.97)', transition: surfaceTransition(preference, 0.16) })
};
export const backdropVariants = {
  hidden: { opacity: 0 },
  visible: (preference: UiMotionPreference) => ({ opacity: 1, transition: surfaceTransition(preference, 0.2) }),
  exit: (preference: UiMotionPreference) => ({ opacity: 0, transition: surfaceTransition(preference, 0.16) })
};
export const drawerVariants = {
  hidden: ({ reduced }: UiMotionPreference) => ({ opacity: reduced ? 0 : 1, transform: reduced ? 'none' : 'translate3d(0, 100%, 0)' }),
  visible: (preference: UiMotionPreference) => ({ opacity: 1, transform: preference.reduced ? 'none' : 'translate3d(0, 0%, 0)', transition: surfaceTransition(preference, 0.24, UI_DRAWER_EASE) }),
  exit: (preference: UiMotionPreference) => ({ opacity: preference.reduced ? 0 : 1, transform: preference.reduced ? 'none' : 'translate3d(0, 100%, 0)', transition: surfaceTransition(preference, 0.2, UI_DRAWER_EASE) })
};
export const notificationVariants = {
  hidden: ({ reduced }: UiMotionPreference) => ({ opacity: 0, transform: reduced ? 'none' : 'translate3d(0, 16px, 0)' }),
  visible: (preference: UiMotionPreference) => ({ opacity: 1, transform: preference.reduced ? 'none' : 'translate3d(0, 0px, 0)', transition: surfaceTransition(preference, 0.2) }),
  exit: (preference: UiMotionPreference) => ({ opacity: 0, transform: preference.reduced ? 'none' : 'translate3d(0, 16px, 0)', transition: surfaceTransition(preference, 0.16) })
};
