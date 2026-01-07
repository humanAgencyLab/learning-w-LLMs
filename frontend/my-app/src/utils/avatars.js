/**
 * Avatar utility - provides list of available avatars and helper functions
 */
import birdAvatar from '../components/Icons-Avatars/birdAvatar.png';
import catAvatar from '../components/Icons-Avatars/catAvatar.png';
import dogAvatar from '../components/Icons-Avatars/dogAvatar.png';
import fishAvatar from '../components/Icons-Avatars/fishAvatar.png';
import lionAvatar from '../components/Icons-Avatars/lionAvatar.png';
import tigerAvatar from '../components/Icons-Avatars/tigerAvatar.png';
import giraffeAvatar from '../components/Icons-Avatars/giraffeAvatar.png';
import bunnyAvatar from '../components/Icons-Avatars/bunnyAvatar.png';
import gorillaAvatar from '../components/Icons-Avatars/gorillaAvatar.png';
import snakeAvatar from '../components/Icons-Avatars/snakeAvatar.png';
import kangarooAvatar from '../components/Icons-Avatars/kangarooAvatar.png';
import sheepAvatar from '../components/Icons-Avatars/sheepAvatar.png';

/**
 * List of all available avatars
 */
export const avatars = [
  birdAvatar,
  catAvatar,
  dogAvatar,
  fishAvatar,
  lionAvatar,
  tigerAvatar,
  giraffeAvatar,
  bunnyAvatar,
  gorillaAvatar,
  snakeAvatar,
  kangarooAvatar,
  sheepAvatar,
];

/**
 * Get a random avatar from the list
 * @returns {string} Avatar path/URL
 */
export function getRandomAvatar() {
  const randomIndex = Math.floor(Math.random() * avatars.length);
  return avatars[randomIndex];
}

/**
 * Get avatar by index (for consistent selection)
 * @param {number} index - Index of avatar (0-based)
 * @returns {string} Avatar path/URL
 */
export function getAvatarByIndex(index) {
  const safeIndex = Math.max(0, Math.min(index, avatars.length - 1));
  return avatars[safeIndex];
}

