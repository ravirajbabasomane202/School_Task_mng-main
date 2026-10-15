import { useEffect, useState } from 'react';
import logoUrl from '../../assets/images/adhira-international-school-logo.svg';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import './AnimatedLogo.css';

export type AnimatedLogoProps = {
  animated?: boolean;
  duration?: number;
  replayOnMount?: boolean;
  variant?: 'full' | 'subtle';
  idleShimmer?: boolean;
  width?: number | string;
  className?: string;
  alt?: string;
};

let storageBlockedPlayed = false;

function AnimatedLogo({
  animated = true,
  duration = 1.6,
  replayOnMount = false,
  variant = 'full',
  idleShimmer = false,
  width = 'clamp(160px, 22vw, 260px)',
  className = '',
  alt = 'Adhira International School'
}: AnimatedLogoProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (!animated || reducedMotion) return;
    try {
      const played = sessionStorage.getItem('adhira_logo_intro_played');
      if (replayOnMount || !played) {
        setPlay(true);
        sessionStorage.setItem('adhira_logo_intro_played', '1');
      }
    } catch {
      if (replayOnMount || !storageBlockedPlayed) {
        storageBlockedPlayed = true;
        setPlay(true);
      }
    }
  }, [animated, reducedMotion, replayOnMount]);

  const shouldAnimate = animated && play && !reducedMotion;
  return (
    <span
      className={`animated-logo ${shouldAnimate ? `is-playing ${variant}` : ''} ${idleShimmer && !reducedMotion ? 'idle-shimmer' : ''} ${className}`}
      style={{ width, aspectRatio: '320 / 119', ['--logo-duration' as string]: `${duration}s`, ['--logo-url' as string]: `url("${logoUrl}")` }}
      role="img"
      aria-label={alt}
      onAnimationEnd={(event) => {
        if (event.animationName === 'logo-enter') {
          event.currentTarget.classList.add('intro-finished');
          setPlay(false);
        }
      }}
    >
      <img className="logo-main" src={logoUrl} alt="" aria-hidden="true" />
      <img className="logo-subtitle" src={logoUrl} alt="" aria-hidden="true" />
      {shouldAnimate ? <span className="logo-shine" aria-hidden="true" /> : null}
      {idleShimmer && !reducedMotion && !shouldAnimate ? <span className="logo-shine logo-idle-shine" aria-hidden="true" /> : null}
    </span>
  );
}

export default AnimatedLogo;
