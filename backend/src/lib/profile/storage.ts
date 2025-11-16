import { get, set, del } from 'idb-keyval';
import type { ProfileRenderPack } from './types';

const KEY_PROFILE = (subject: string) => `profile:${subject}`;
const KEY_AVATAR  = (ref: string)    => `avatar:${ref}`;

export async function loadProfileFromIDB(subject: string) {
  return get<ProfileRenderPack>(KEY_PROFILE(subject));
}
export async function saveProfileToIDB(pack: ProfileRenderPack) {
  return set(KEY_PROFILE(pack.subject), pack);
}
export async function saveAvatarBlob(ref: string, blob: Blob) {
  return set(KEY_AVATAR(ref), blob);
}
export async function loadAvatarBlob(ref: string) {
  return get<Blob>(KEY_AVATAR(ref));
}
export async function clearProfile(subject: string) {
  return del(KEY_PROFILE(subject));
}
