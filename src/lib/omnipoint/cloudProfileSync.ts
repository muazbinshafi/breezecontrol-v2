// cloudProfileSync — keeps the local GestureProfileStore in sync with the
// cloud `gesture_profiles` table. Runs only when a user is signed in.
//
// Strategy:
//   1) On sign-in: pull cloud rows → merge into local store (cloud wins on
//      shared ids; local-only profiles get pushed up).
//   2) On every local store change while signed-in: debounce-push to cloud.
//   3) Built-in profiles (id starts with "builtin-") are NEVER persisted.

import { supabase } from "@/integrations/supabase/client";
import {
  GestureProfileStore,
  type GestureProfile,
} from "./GestureProfiles";
import type { GestureSettings } from "./GestureSettings";

let syncing = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let unsubLocal: (() => void) | null = null;
let activeUserId: string | null = null;

interface CloudRow {
  id: string;
  user_id: string;
  name: string;
  settings: GestureSettings;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToProfile(r: CloudRow): GestureProfile {
  return {
    id: r.id,
    name: r.name,
    settings: r.settings,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  };
}

async function pullFromCloud(userId: string) {
  const { data, error } = await supabase
    .from("gesture_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[cloudProfileSync] pull failed:", error.message);
    return;
  }

  const local = GestureProfileStore.get();
  const cloudProfiles = ((data ?? []) as unknown as CloudRow[]).map(rowToProfile);
  const cloudIds = new Set(cloudProfiles.map((p) => p.id));

  // Keep built-ins; replace user profiles with cloud copies; preserve any
  // local user profiles that aren't in the cloud yet (they'll be pushed).
  const builtins = local.profiles.filter((p) => p.id.startsWith("builtin-"));
  const localOnly = local.profiles.filter(
    (p) => !p.id.startsWith("builtin-") && !cloudIds.has(p.id),
  );

  const merged = [...builtins, ...cloudProfiles, ...localOnly];
  const activeRow = ((data ?? []) as unknown as CloudRow[]).find((r) => r.is_active);
  const activeId = activeRow?.id ?? local.activeId ?? builtins[0]?.id ?? null;

  // Mute pushes while we mutate the store from the pull.
  syncing = true;
  GestureProfileStore.replace({ profiles: merged, activeId });
  syncing = false;

  // Push any local-only profiles that aren't in the cloud yet.
  for (const p of localOnly) {
    await upsertProfile(userId, p, p.id === activeId);
  }
}

async function upsertProfile(
  userId: string,
  p: GestureProfile,
  isActive: boolean,
) {
  const { error } = await supabase.from("gesture_profiles").upsert(
    {
      id: p.id,
      user_id: userId,
      name: p.name,
      settings: p.settings as unknown as Record<string, unknown>,
      is_active: isActive,
    } as never,
    { onConflict: "id" },
  );
  if (error) console.warn("[cloudProfileSync] upsert failed:", error.message);
}

async function pushAll(userId: string) {
  if (syncing) return;
  const local = GestureProfileStore.get();
  const userProfiles = local.profiles.filter((p) => !p.id.startsWith("builtin-"));

  // Upsert every non-builtin profile.
  if (userProfiles.length) {
    const rows = userProfiles.map((p) => ({
      id: p.id,
      user_id: userId,
      name: p.name,
      settings: p.settings as unknown as Record<string, unknown>,
      is_active: p.id === local.activeId,
    }));
    const { error } = await supabase
      .from("gesture_profiles")
      .upsert(rows as never, { onConflict: "id" });
    if (error) console.warn("[cloudProfileSync] bulk upsert failed:", error.message);
  }

  // Reset is_active flags for any profile that's no longer active.
  if (local.activeId && !local.activeId.startsWith("builtin-")) {
    await supabase
      .from("gesture_profiles")
      .update({ is_active: false })
      .eq("user_id", userId)
      .neq("id", local.activeId);
  }

  // Cleanup: delete cloud rows that no longer exist locally.
  const { data: cloudRows } = await supabase
    .from("gesture_profiles")
    .select("id")
    .eq("user_id", userId);
  const localIds = new Set(userProfiles.map((p) => p.id));
  const toDelete = (cloudRows ?? [])
    .map((r) => r.id as string)
    .filter((id) => !localIds.has(id));
  if (toDelete.length) {
    await supabase.from("gesture_profiles").delete().in("id", toDelete);
  }
}

function schedulePush(userId: string) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushAll(userId);
  }, 500);
}

export function startCloudSync(userId: string) {
  if (activeUserId === userId) return;
  stopCloudSync();
  activeUserId = userId;
  void pullFromCloud(userId);
  unsubLocal = GestureProfileStore.subscribe(() => {
    if (!activeUserId) return;
    schedulePush(activeUserId);
  });
}

export function stopCloudSync() {
  activeUserId = null;
  if (unsubLocal) {
    unsubLocal();
    unsubLocal = null;
  }
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}
