import styles from './RobotPeek.module.css';

/**
 * A steel robot sitting on the top edge of the sign-in box, holding up a WELCOME banner.
 *
 * Drawn by hand as inline SVG. A Lottie's artwork is baked keyframe data — it can be moved
 * and scaled but never reposed — and every ready-made robot is a standing figure, so a
 * character genuinely seated on a ledge only exists if it is drawn. It also costs a couple
 * of kilobytes rather than the ~600 KB a Lottie player adds to the bundle.
 *
 * Posed in three-quarter profile, because that is what makes a sit read: the thighs run
 * forward from the hip, the knees bend, and only the shins hang down. Legs dropping straight
 * from the body — the obvious way to draw it from the front — looks like standing.
 *
 * Realism comes from the joints rather than the outline: shoulders, elbows, hips and knees
 * are separate spheres with their own highlights, limbs are shaded across their width so they
 * read as cylinders, and every plate carries a seam and a rim light. The far leg and far arm
 * are darkened to sit behind the body.
 *
 * The viewBox starts at negative coordinates so the antenna's glow and the banner's finial
 * have room to spill past the artwork without being clipped by their own canvas.
 *
 * y=126 is where the robot meets the card. Everything above rests on the edge; the shins and
 * feet below hang over the card's face. The CSS lines that up.
 *
 * `sad` turns the greeting into a commiseration when a sign-in is refused: the smile is
 * flipped rather than redrawn, the head drops, and the banner sags.
 */
export default function RobotPeek({ sad = false }) {
  return (
    <div className={`${styles.wrap} ${sad ? styles.sad : ''}`} aria-hidden="true">
      <svg className={styles.bot} viewBox="-26 -18 250 236" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Across-the-width shading, so a limb reads as a cylinder rather than a bar. */}
          <linearGradient id="rb-limb" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#39424e" />
            <stop offset="22%" stopColor="#7c8794" />
            <stop offset="45%" stopColor="#aab4c0" />
            <stop offset="70%" stopColor="#6e7986" />
            <stop offset="100%" stopColor="#333b46" />
          </linearGradient>

          {/* The same, darkened, for the limbs on the far side of the body. */}
          <linearGradient id="rb-limb-far" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#242b34" />
            <stop offset="30%" stopColor="#4a545f" />
            <stop offset="60%" stopColor="#3e4752" />
            <stop offset="100%" stopColor="#20262e" />
          </linearGradient>

          {/* Body plate: lit from above-left, same steel family as the wordmark. */}
          <linearGradient id="rb-plate" x1="0.15" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="18%" stopColor="#e2e8ee" />
            <stop offset="48%" stopColor="#b3bec9" />
            <stop offset="78%" stopColor="#78838f" />
            <stop offset="100%" stopColor="#525c68" />
          </linearGradient>

          <radialGradient id="rb-joint" cx="0.34" cy="0.28" r="0.85">
            <stop offset="0%" stopColor="#fbfcfd" />
            <stop offset="30%" stopColor="#c9d1da" />
            <stop offset="65%" stopColor="#79848f" />
            <stop offset="100%" stopColor="#39424c" />
          </radialGradient>

          <linearGradient id="rb-visor" x1="0.2" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#404a56" />
            <stop offset="45%" stopColor="#1a212a" />
            <stop offset="100%" stopColor="#0f151b" />
          </linearGradient>

          <radialGradient id="rb-glow">
            <stop offset="0%" stopColor="#fff3d6" />
            <stop offset="42%" stopColor="#ffb845" />
            <stop offset="100%" stopColor="#ff7a18" />
          </radialGradient>

          {/* The ribbon runs along its length as well as down, so the far end sits back in
              shade and the end nearest the pole catches the light — the same indigo as the
              Sign In button, so the two belong to one palette. */}
          <linearGradient id="rb-banner" x1="0" y1="0.1" x2="0.85" y2="0.95">
            <stop offset="0%" stopColor="#4046c9" />
            <stop offset="35%" stopColor="#5a61ef" />
            <stop offset="70%" stopColor="#6c72ff" />
            <stop offset="100%" stopColor="#454bd2" />
          </linearGradient>

          {/* The travelling glint that crosses the plates. */}
          <linearGradient id="rb-shine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Confines the glint to the metal, so it never crosses open space. */}
          <clipPath id="rb-body-clip">
            <rect x="98" y="9" width="58" height="47" rx="15" />
            <rect x="100" y="56" width="54" height="48" rx="17" />
            <rect x="104" y="98" width="46" height="28" rx="12" />
          </clipPath>

          <filter id="rb-soft" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
        </defs>

        {/* ══ FAR LEG — behind the body, so it is drawn first and darkened ══ */}
        <g className={styles.legFar}>
          <rect x="72" y="106" width="46" height="19" rx="9.5" fill="url(#rb-limb-far)" />
          <circle cx="76" cy="115" r="11" fill="url(#rb-joint)" opacity="0.55" />
          <rect x="66" y="113" width="19" height="40" rx="9.5" fill="url(#rb-limb-far)" />
          <path d="M60 149 h27 a7 7 0 0 1 7 7 v4 a5 5 0 0 1 -5 5 h-31 a6 6 0 0 1 -6 -6 v-4 a6 6 0 0 1 6 -6 z"
                fill="url(#rb-limb-far)" />
        </g>

        {/* ══ TORSO ══ */}
        <rect x="104" y="98" width="46" height="28" rx="12" fill="url(#rb-plate)" />
        <rect x="104" y="98" width="46" height="28" rx="12" fill="none"
              stroke="rgba(255,255,255,.5)" strokeWidth="1" />
        <circle cx="112" cy="114" r="11" fill="url(#rb-joint)" />

        <rect x="100" y="56" width="54" height="48" rx="17" fill="url(#rb-plate)" />
        <rect x="100" y="56" width="54" height="48" rx="17" fill="none"
              stroke="rgba(255,255,255,.55)" strokeWidth="1" />
        <path d="M104 101 H150" stroke="rgba(0,0,0,.22)" strokeWidth="1.4" strokeLinecap="round" />
        <rect x="112" y="68" width="30" height="22" rx="8" fill="url(#rb-visor)" />
        <circle className={styles.chest} cx="127" cy="79" r="3.6" fill="url(#rb-glow)" />

        {/* ══ NEAR ARM — resting on the card edge, taking its weight ══ */}
        <g>
          <circle cx="150" cy="68" r="10" fill="url(#rb-joint)" />
          <rect x="145" y="70" width="15" height="30" rx="7.5" fill="url(#rb-limb)" />
          <circle cx="152" cy="101" r="8" fill="url(#rb-joint)" />
          <rect x="145" y="101" width="15" height="22" rx="7.5" fill="url(#rb-limb)" />
          <ellipse cx="152" cy="124" rx="9" ry="6.5" fill="url(#rb-plate)" />
        </g>

        {/* ══ NEAR LEG ══ */}
        <g className={styles.legNear}>
          <rect x="76" y="112" width="46" height="21" rx="10.5" fill="url(#rb-limb)" />
          <circle cx="80" cy="122" r="12" fill="url(#rb-joint)" />
          <rect x="69" y="120" width="21" height="42" rx="10.5" fill="url(#rb-limb)" />
          <circle cx="79" cy="160" r="8" fill="url(#rb-joint)" />
          <path d="M62 156 h28 a8 8 0 0 1 8 8 v5 a5 5 0 0 1 -5 5 h-33 a6 6 0 0 1 -6 -6 v-5 a7 7 0 0 1 7 -7 z"
                fill="url(#rb-plate)" />
          <path d="M62 156 h28 a8 8 0 0 1 8 8 H62 Z" fill="rgba(255,255,255,.25)" />
        </g>

        {/* ══ BANNER — arm, pole, cloth and grip move as one rig ══
             Drawn after the torso so the arm passes in front of the chest, but before the
             head so the head overlaps the shoulder rather than the face being covered. The
             grip is held out to the left of the skull, clear of it — behind the head was
             where the hand disappeared before. */}
        <g className={styles.bannerRig}>
          {/* Upper arm: shoulder down-right, elbow up-left. */}
          <rect x="90" y="46" width="16" height="30" rx="8" fill="url(#rb-limb)"
                transform="rotate(28 98 61)" />
          <circle cx="104" cy="70" r="9.5" fill="url(#rb-joint)" />
          {/* Forearm, reaching up to the pole. */}
          <rect x="80" y="30" width="15" height="28" rx="7.5" fill="url(#rb-limb)"
                transform="rotate(12 87 44)" />
          <circle cx="90" cy="53" r="7.5" fill="url(#rb-joint)" />

          {/* Pole, held well clear of the head, which starts at x=98. */}
          <rect x="79" y="6" width="4.5" height="46" rx="2.25" fill="url(#rb-limb)" />
          <circle cx="81.2" cy="5" r="4.5" fill="url(#rb-joint)" />

          {/* Cloth: a ribbon with a swallowtail, unfurling away from the pole. */}
          <g className={styles.cloth}>
            <path d="M80 9 H-18 L-4 29 L-18 49 H80 Z" fill="url(#rb-banner)" />
            {/* Light along the top fold, shadow along the bottom. */}
            <path d="M80 9 H-18 L-13.2 15.9 H80 Z" fill="rgba(255,255,255,.22)" />
            <path d="M80 42 H-13.2 L-18 49 H80 Z" fill="rgba(0,0,0,.16)" />
            {/* A crisp edge, so the ribbon reads as cloth rather than a flat block. */}
            <path d="M80 9 H-18 L-4 29 L-18 49 H80 Z" fill="none"
                  stroke="rgba(255,255,255,.4)" strokeWidth="1" strokeLinejoin="round" />
            {/* The shaded gusset where the cloth turns at the pole. */}
            <path d="M74 9 H80 V49 H74 Z" fill="rgba(0,0,0,.16)" />

            {/* textLength pins the word to the cloth's width, so it can never spill past the
                edge if a fallback font is wider than the one it was measured against. */}
            <text x="34" y="34" className={styles.bannerText} textAnchor="middle"
                  textLength="76" lengthAdjust="spacingAndGlyphs">WELCOME</text>
          </g>

          {/* The grip, last so it closes over the pole and the cloth's edge. */}
          <g>
            <rect x="72" y="14" width="20" height="14" rx="7" fill="url(#rb-plate)" />
            <rect x="72" y="14" width="20" height="14" rx="7" fill="none"
                  stroke="rgba(255,255,255,.55)" strokeWidth="0.9" />
            {/* Thumb wrapping the far side of the pole — what makes a grip read as a grip. */}
            <rect x="78" y="10" width="12" height="5.5" rx="2.75" fill="url(#rb-limb)" />
            {/* Knuckle line. */}
            <path d="M77 21 H87" stroke="rgba(0,0,0,.22)" strokeWidth="1.1" strokeLinecap="round" />
          </g>
        </g>

        {/* ══ HEAD — tilts as the banner goes up ══ */}
        <g className={styles.head}>
          <rect x="118" y="48" width="18" height="12" rx="5" fill="url(#rb-limb)" />
          <path d="M119 54 H135" stroke="rgba(0,0,0,.25)" strokeWidth="1.2" />

          <rect x="125.5" y="-6" width="3" height="12" rx="1.5" fill="url(#rb-limb)" />
          <circle className={styles.tip} cx="127" cy="-7" r="7" fill="url(#rb-glow)" filter="url(#rb-soft)" />
          <circle className={styles.tip} cx="127" cy="-7" r="3.6" fill="url(#rb-glow)" />

          <rect x="98" y="9" width="58" height="47" rx="15" fill="url(#rb-plate)" />
          <rect x="98" y="9" width="58" height="47" rx="15" fill="none"
                stroke="rgba(255,255,255,.6)" strokeWidth="1" />
          <rect x="105" y="13" width="44" height="7" rx="3.5" fill="rgba(255,255,255,.45)" />
          <path d="M100 23 H154" stroke="rgba(0,0,0,.14)" strokeWidth="1" />

          <rect x="92" y="25" width="9" height="16" rx="4.5" fill="url(#rb-limb)" />
          <rect x="153" y="25" width="9" height="16" rx="4.5" fill="url(#rb-limb)" />
          <circle cx="96.5" cy="33" r="2.4" fill="rgba(0,0,0,.35)" />
          <circle cx="157.5" cy="33" r="2.4" fill="rgba(0,0,0,.35)" />

          {/* Visor, deepened to give the mouth somewhere to live. */}
          <rect x="105" y="20" width="44" height="30" rx="12" fill="url(#rb-visor)" />
          <rect x="105" y="20" width="44" height="30" rx="12" fill="none"
                stroke="rgba(0,0,0,.4)" strokeWidth="1" />

          <g className={styles.eyes}>
            <ellipse cx="118" cy="30" rx="7.5" ry="7.5" fill="url(#rb-glow)" filter="url(#rb-soft)" opacity="0.5" />
            <ellipse cx="136" cy="30" rx="7.5" ry="7.5" fill="url(#rb-glow)" filter="url(#rb-soft)" opacity="0.5" />
            <ellipse cx="118" cy="30" rx="4.8" ry="4.8" fill="url(#rb-glow)" />
            <ellipse cx="136" cy="30" rx="4.8" ry="4.8" fill="url(#rb-glow)" />
            {/* Catchlights — what stops a glowing dot looking flat. */}
            <circle cx="116.5" cy="28.4" r="1.4" fill="rgba(255,255,255,.9)" />
            <circle cx="134.5" cy="28.4" r="1.4" fill="rgba(255,255,255,.9)" />
          </g>

          {/* The smile: a lit arc across the visor, with its own soft bloom behind it. */}
          <g className={styles.smile}>
            <path d="M117 40 Q127 47.5 137 40" stroke="url(#rb-glow)" strokeWidth="4.5"
                  strokeLinecap="round" fill="none" filter="url(#rb-soft)" opacity="0.55" />
            <path d="M117 40 Q127 47.5 137 40" stroke="url(#rb-glow)" strokeWidth="2.6"
                  strokeLinecap="round" fill="none" />
          </g>

          <path d="M108 23 L119 23 L110 47 L105 47 Z" fill="rgba(255,255,255,.07)" />
        </g>

        {/* ══ The glint that travels across the plates, clipped to the metal ══ */}
        <g clipPath="url(#rb-body-clip)">
          <rect className={styles.glint} x="0" y="0" width="26" height="140"
                fill="url(#rb-shine)" transform="skewX(-16)" />
        </g>
      </svg>
    </div>
  );
}
