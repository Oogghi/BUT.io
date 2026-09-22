import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { motion } from 'motion/react';
import { useAppReducedMotion } from './MotionPreferences';

/** Native modality supplies focus containment, inert background, and focus restoration. */
export function Drawer({
  open,
  onClose,
  label,
  id,
  popup = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  id?: string;
  /** Centred on the screen instead of sliding in from the side. */
  popup?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reduced = useAppReducedMotion();
  const [present, setPresent] = useState(open);

  useLayoutEffect(() => {
    if (open) {
      setPresent(true);
      if (!dialog.current?.open) dialog.current?.showModal();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      id={id}
      className="drawer-dialog"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <motion.div
        className="community-drawer-layer"
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.16 }}
        onAnimationComplete={() => {
          if (!open) {
            dialog.current?.close();
            setPresent(false);
          }
        }}
      >
        <div
          className="community-drawer-backdrop"
          aria-hidden="true"
          onClick={onClose}
        />
        <motion.div
          className={`community-drawer${popup ? ' is-popup' : ''}`}
          initial={false}
          animate={
            popup
              ? { y: open || reduced ? 0 : 16 }
              : { x: open || reduced ? 0 : 24 }
          }
          transition={{ duration: reduced ? 0 : 0.2 }}
        >
          {(open || present) && children}
        </motion.div>
      </motion.div>
    </dialog>
  );
}
