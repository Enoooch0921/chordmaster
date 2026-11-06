import React from 'react';
import { motion, useIsPresent, useMotionValue } from 'motion/react';
import { useKeyboardMotionInterrupt, useUiMotion } from '../../hooks/useUiMotion';
import type { PreviewEditorDeviceLayout } from '../../lib/previewEditorLayout';
import { drawerVariants, notificationVariants } from '../../lib/uiMotion';

interface KeyboardSurfaceProps extends React.HTMLAttributes<HTMLElement> {
  docked: boolean;
  'data-device-layout'?: PreviewEditorDeviceLayout;
}

/** Keep positioning, dragging and avoidance measurements outside the animated ink. */
const KeyboardSurface = React.forwardRef<HTMLElement, KeyboardSurfaceProps>(
  function KeyboardSurface({ docked, children, className, style, ...props }, ref) {
    const preference = useUiMotion();
    const present = useIsPresent();
    const variants = docked ? drawerVariants : notificationVariants;
    const transform = useMotionValue(variants.visible(preference).transform);
    const opacity = useMotionValue(1);
    useKeyboardMotionInterrupt(() => {
      // Complete through Motion so an exiting surface still releases presence.
      transform.animation?.complete(); opacity.animation?.complete();
    });
    const { paddingBottom, ...position } = style ?? {};
    return <div {...props} ref={ref as React.Ref<HTMLDivElement>} data-keyboard-position-shell
      data-keyboard-docked={docked ? '' : undefined}
      inert={!present ? true : props.inert} aria-hidden={!present ? true : props['aria-hidden']}
      className="z-[5000] flex flex-col" style={position}>
      <motion.section data-keyboard-refined data-device-layout={props['data-device-layout']}
        data-keyboard-motion={present ? 'open' : 'closing'} className={className}
        style={{ paddingBottom, maxHeight: 'inherit', minHeight: 0, flexShrink: 1, transform, opacity }}
        custom={preference} variants={variants}
        initial={preference.instant ? false : 'hidden'} animate="visible" exit="exit">
        {children}
      </motion.section>
    </div>;
  }
);

export default KeyboardSurface;
