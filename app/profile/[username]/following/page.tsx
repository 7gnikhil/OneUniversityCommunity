import { normaliseUsername } from "@/lib/validation";
import FollowList from "../FollowList";

// Who a student follows (accepted follow graph) — see FollowList.
export default async function FollowingPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <FollowList username={normaliseUsername(username)} side="following" />;
}
