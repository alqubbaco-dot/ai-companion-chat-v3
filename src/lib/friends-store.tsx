import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { readStored, writeStored } from "./storage";
import { supabase } from "./supabase";

export type UserStatus = "online" | "offline";

export type Person = {
  id: string;
  name: string;
  nameEn: string;
  handle: string;
  role: string;
  roleEn: string;
  status: UserStatus;
  lastSeenMinutes: number;
  accent: "teal" | "coral" | "butter";
  phone?: string;
};

export type Relation = "none" | "friend" | "incoming" | "outgoing" | "blocked";

export type Profile = {
  name: string;
  handle: string;
  bio: string;
  phone?: string;
};

type Relations = {
  friends: string[];
  incoming: string[];
  outgoing: string[];
  blocked: string[];
};

const DEFAULT_RELATIONS: Relations = {
  friends: [],
  incoming: [],
  outgoing: [],
  blocked: [],
};

const DEFAULT_PROFILE: Profile = {
  name: "",
  handle: "",
  bio: "",
  phone: "",
};

type FriendsValue = {
  hydrated: boolean;
  directory: Person[];
  profile: Profile;
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
  blocked: Person[];
  relationOf: (id: string) => Relation;
  searchUsers: (query: string) => Person[];
  sendRequest: (id: string) => void;
  cancelRequest: (id: string) => void;
  acceptRequest: (id: string) => void;
  rejectRequest: (id: string) => void;
  removeFriend: (id: string) => void;
  blockUser: (id: string) => void;
  unblockUser: (id: string) => void;
  updateProfile: (profile: Profile) => void;
  resetAll: () => void;
  registerUserWithPhone: (name: string, phone: string) => Promise<void>;
};

const FriendsContext = createContext<FriendsValue | null>(null);
const REL_KEY = "relations";
const PROFILE_KEY = "profile";

export function useFriends(): FriendsValue {
  const ctx = useContext(FriendsContext);
  if (!ctx) throw new Error("useFriends must be used inside FriendsProvider");
  return ctx;
}

export function FriendsProvider({ children }: { children: ReactNode }) {
  const [directory, setDirectory] = useState<Person[]>([]);
  const [relations, setRelations] = useState<Relations>(DEFAULT_RELATIONS);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [hydrated, setHydrated] = useState(false);

  const fetchCloudUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("users_directory").select("*");
      if (!error && data) {
        const mappedData = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          nameEn: item.name_en || item.name,
          handle: item.handle,
          role: item.role,
          roleEn: item.role_en,
          status: item.status,
          lastSeenMinutes: item.last_seen_minutes || 0,
          accent: item.accent || "teal",
          phone: item.phone
        }));
        setDirectory(mappedData as Person[]);
      }
    } catch (err) {
      console.error("خطأ في جلب بيانات الحسابات السحابية الموحدة:", err);
    }
  }, []);

  useEffect(() => {
    const localProf = readStored<Profile>(PROFILE_KEY, DEFAULT_PROFILE);
    setRelations(readStored<Relations>(REL_KEY, DEFAULT_RELATIONS));
    
    if (localProf && localProf.phone && localProf.phone.trim() !== "") {
      setProfile(localProf);
    } else {
      setProfile(DEFAULT_PROFILE);
    }
    
    fetchCloudUsers();
    setHydrated(true);

    const channel = supabase
      .channel("schema-db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "users_directory" }, () => {
        fetchCloudUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCloudUsers]);

  const registerUserWithPhone = useCallback(async (name: string, phone: string) => {
    const cleanPhone = phone.trim();
    const cleanName = name.trim();
    const generatedId = "u_" + cleanPhone;
    const generatedHandle = "@" + cleanName.toLowerCase().replace(/\s+/g, "_") + "_" + cleanPhone.slice(-3);

    const nextProfile: Profile = {
      name: cleanName,
      handle: generatedHandle,
      bio: "متصل الآن من هاتف حقيقي.",
      phone: cleanPhone
    };
    
    setProfile(nextProfile);
    writeStored(PROFILE_KEY, nextProfile);
    await fetchCloudUsers();
  }, [fetchCloudUsers]);

  const update = useCallback((next: Relations) => {
    setRelations(next);
    writeStored(REL_KEY, next);
  }, []);

  const detach = useCallback(
    (state: Relations, id: string): Relations => ({
      friends: state.friends.filter((x) => x !== id),
      incoming: state.incoming.filter((x) => x !== id),
      outgoing: state.outgoing.filter((x) => x !== id),
      blocked: state.blocked.filter((x) => x !== id),
    }),
    [],
  );

  const byIds = useCallback(
    (ids: string[]) =>
      ids
        .map((id) => directory.find((p) => p.id === id))
        .filter((p): p is Person => Boolean(p)),
    [directory],
  );

  const relationOf = useCallback(
    (id: string): Relation => {
      if (relations.blocked.includes(id)) return "blocked";
      if (relations.friends.includes(id)) return "friend";
      if (relations.incoming.includes(id)) return "incoming";
      if (relations.outgoing.includes(id)) return "outgoing";
      return "none";
    },
    [relations],
  );

  const value = useMemo<FriendsValue>(() => {
    return {
      hydrated,
      directory,
      profile,
      friends: byIds(relations.friends),
      incoming: byIds(relations.incoming),
      outgoing: byIds(relations.outgoing),
      blocked: byIds(relations.blocked),
      relationOf,
      searchUsers: (query) => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return directory.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.nameEn.toLowerCase().includes(q) ||
            p.handle.toLowerCase().includes(q) ||
            (p.phone && p.phone.includes(q))
        );
      },
      sendRequest: (id) => {
        const base = detach(relations, id);
        update({ ...base, outgoing: [...base.outgoing, id] });
      },
      cancelRequest: (id) => update(detach(relations, id)),
      acceptRequest: (id) => {
        const base = detach(relations, id);
        update({ ...base, friends: [...base.friends, id] });
      },
      rejectRequest: (id) => update(detach(relations, id)),
      removeFriend: (id) => update(detach(relations, id)),
      blockUser: (id) => {
        const base = detach(relations, id);
        update({ ...base, blocked: [...base.blocked, id] });
      },
      unblockUser: (id) => update(detach(relations, id)),
      updateProfile: (next) => {
        setProfile(next);
        writeStored(PROFILE_KEY, next);
      },
      resetAll: () => {
        update(DEFAULT_RELATIONS);
        setProfile(DEFAULT_PROFILE);
        writeStored(PROFILE_KEY, DEFAULT_PROFILE);
      },
      registerUserWithPhone
    };
  }, [hydrated, directory, profile, relations, byIds, relationOf, detach, update, registerUserWithPhone]);

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}
