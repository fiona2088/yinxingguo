import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [showLogo, setShowLogo] = useState(true);

  useEffect(() => {
    // 仅展示 Logo，结束后直接进入登录页
    const hideTimer = setTimeout(() => {
      setShowLogo(false);
    }, 2500);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 3200);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(completeTimer);
    };
  }, []);

  return (
    <>
      {/* Logo 界面 */}
      {showLogo && (
        <motion.div 
          className="fixed inset-0 bg-black flex items-center justify-center z-50"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 1.7 }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="flex items-center justify-center"
          >
            {/* Logo image with invert filter */}
            <motion.img 
              src="/a72583cc8af6a68248f6b5ce37264fe6.png" 
              alt="Logo" 
              className="w-64 h-64 filter invert" 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </motion.div>
        </motion.div>
      )}

    </>
  );
}