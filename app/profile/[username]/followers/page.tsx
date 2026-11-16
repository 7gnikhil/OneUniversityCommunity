import { normaliseUsername } from "@/lib/validation";
import FollowList from "../FollowList";

// Followers of a student (accepted follow graph) — see FollowList.
export default async function FollowersPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <FollowList username={normaliseUsername(username)} side="followers" />;
}
