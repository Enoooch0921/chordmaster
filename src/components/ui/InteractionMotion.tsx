import { AnimatePresence, motion, useIsPresent, type HTMLMotionProps } from 'motion/react';
import { type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { useUiMotion } from '../../hooks/useUiMotion';
import { popoverVariants, UI_EASE_OUT, type UiMotionPreference } from '../../lib/uiMotion';

interface PopoverProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  ready?: boolean;
  instantExit?: boolean;
  panelRef?: Ref<HTMLDivElement>;
  origin?: string;
  shellClassName?: string;
  animateOnMount?: boolean;
  propagate?: boolean;
}
/** Animate the visual child; the anchored measuring shell never transforms. */
export function AnimatedPopover({ open, ready = true, instantExit = false, panelRef, origin = '100% 0%', shellClassName, className, children, style, animateOnMount = false, propagate = false, ...props }: PopoverProps) {
  const preference = useUiMotion();
  const exitPreference = { ...preference, instant: preference.instant || instantExit };
  return <AnimatePresence initial={animateOnMount ? undefined : false} custom={exitPreference} propagate={propagate}>
    {open && <PopoverBody key="popover" panelRef={panelRef} className={className} shellClassName={shellClassName} style={style} origin={origin} preference={preference} ready={ready} {...props}>{children}</PopoverBody>}
  </AnimatePresence>;
}
function PopoverBody({ panelRef, shellClassName, className, children, style, origin, preference, ready, ...props }: Omit<PopoverProps, 'open' | 'instantExit'> & { preference: UiMotionPreference }) {
  const present = useIsPresent();
  return <div {...props} ref={panelRef} style={style} className={shellClassName} data-ui-popover inert={!present ? true : undefined} aria-hidden={!present ? true : undefined}>
    <motion.div className={className} style={{ transformOrigin: origin }} custom={preference} variants={popoverVariants} initial={preference.instant ? false : 'hidden'} animate={ready ? 'visible' : 'hidden'} exit="exit">
      {children}
    </motion.div>
  </div>;
}

const disclosureVariants = {
  hidden: { opacity: 0 },
  visible: (preference: UiMotionPreference) => ({ opacity: 1, transition: {
    duration: preference.instant ? 0 : 0.125, ease: UI_EASE_OUT
  } }),
  exit: (preference: UiMotionPreference) => ({ opacity: 0, transition: {
    duration: preference.instant ? 0 : 0.125, ease: UI_EASE_OUT
  } })
};
export function AnimatedDisclosure({ open, children, className, id, resize = false }: { open: boolean; children: ReactNode; className?: string; id?: string; resize?: boolean }) {
  const preference = useUiMotion();
  return <AnimatePresence initial={false} custom={preference}>
    {open && <DisclosureBody key="disclosure" preference={preference} className={className} id={id} resize={resize}>{children}</DisclosureBody>}
  </AnimatePresence>;
}
/** Keep final geometry during a short fade, then remove it in one layout change. */
function DisclosureBody({ preference, children, className, id, resize }: { preference: UiMotionPreference; children: ReactNode; className?: string; id?: string; resize: boolean }) {
  const present = useIsPresent();
  return <motion.div id={id} data-ui-disclosure inert={!present ? true : undefined} aria-hidden={!present ? true : undefined}
    custom={preference} variants={disclosureVariants} initial={resize ? false : 'hidden'}
    animate="visible" exit="exit" style={{ overflow: 'hidden' }}>
    <div className={className}>{children}</div>
  </motion.div>;
}

/** Presence keeps exiting surfaces mounted; make that visual-only immediately. */
export function PresenceSurface(props: HTMLMotionProps<'div'>) {
  const present = useIsPresent();
  return <motion.div {...props} data-ui-presence={present ? 'visible' : 'exiting'} style={{ ...props.style, ...(!present ? { pointerEvents: 'none' as const } : {}) }} inert={!present ? true : props.inert} aria-hidden={!present ? true : props['aria-hidden']} />;
}
export function PresenceBackdrop(props: HTMLMotionProps<'button'>) {
  const present = useIsPresent();
  return <motion.button {...props} data-ui-presence={present ? 'visible' : 'exiting'} style={{ ...props.style, ...(!present ? { pointerEvents: 'none' as const } : {}) }} inert={!present ? true : props.inert} aria-hidden={!present ? true : props['aria-hidden']} />;
}
