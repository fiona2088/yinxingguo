import { motion } from 'framer-motion';

interface PageTransitionProps {
  isActive: boolean;
}

export function PageTransition({ isActive }: PageTransitionProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: isActive ? 1 : 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="absolute inset-0 bg-black"
        initial={{ scaleX: 0, transformOrigin: "left" }}
        animate={{ scaleX: isActive ? 1 : 0 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-0 bg-black"
        initial={{ scaleX: 0, transformOrigin: "right" }}
        animate={{ scaleX: isActive ? 1 : 0 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      />
    </motion.div>
  );
}
