// Help content — the FAQ + community rules, written from how OneUco
// actually works. ONE source for both surfaces that show them: the
// Help page (app/help) and Profile & Settings → About & FAQs
// (app/profile). Edit the strings HERE and both move together.

export const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Who can join OneUco?",
    a: "Any college or university student. Sign up with a personal email (or Google), claim your @username and OneUco ID, and declare your college, branch and graduation year. No ID-card checking, no college email needed — completing the declaration activates your account.",
  },
  {
    q: "What can other students see about me?",
    a: "Only your public profile: photo, name, bio and branch. Your college, graduation year, email and phone stay private on your account and are never shown to other students.",
  },
  {
    q: "How does Fling work?",
    a: "Like someone and if they like you back, it's a match and a chat opens in Homies. Your intention and preferences (Profile → Settings) shape who you see; everything defaults to \"Any\" and nothing is mandatory.",
  },
  {
    q: "What is Maya Jwalam?",
    a: "The main channel — every OneUco student, posting anonymously. Nobody there can see your name, @username, OneUco ID or photo, and there's no member list to browse. If someone asks \"show me your profile\" on your post, the request lands in your Inbox: accept to share your public profile with just that person (revocable any time), or decline and stay anonymous.",
  },
  {
    q: "What is Tea?",
    a: "Tea is where the group hangouts live: public ones anyone can join, and private ones (among friends, or among strangers) that need an invite code, an invite link, or a direct add from a member. Mods and admins can tag messages with flairs; flagging your own message ReqToAdmin sends it to the admin queue.",
  },
  {
    q: "Can I have two accounts with the same email?",
    a: "No — one account per email, enforced by the database. If sign-up says an account already exists, just log in instead. Your username and OneUco ID are unique too.",
  },
  {
    q: "How do I reach the developer?",
    a: "Use the Req to Developer form below — it's the contact channel. Pick a type (change, add-on, bug, other), describe it, and track the status here and in your Inbox: Received → Planned → Done, or Declined.",
  },
];

export const RULES: string[] = [
  "Be a real student, and be yourself — one account per person, no impersonation.",
  "Respect anonymity: never try to identify a Maya Jwalam poster who hasn't revealed themselves to you, and never share someone else's revealed identity onwards.",
  "No harassment, hate speech, spam or scams — in chats, teas, Chirps or reveal requests. Blocks are absolute: a blocked person stays blocked.",
  "Keep photos and posts appropriate for a student community; anything sexual involving minors is banned outright and reported.",
  "Admins can remove posts, revoke reveals and suspend accounts that break these rules. Use the ReqToAdmin flair or a report to flag problems.",
];

// The About line for the combined About & FAQs section: what OneUco
// is, in one breath (the FAQ above carries the detail).
export const ABOUT_ONEUCO =
  "OneUco is one community for students of every college and university — meet people in Fling, chat in Homies, hang out in Tea, post to Chirp, and stay anonymous in Maya Jwalam unless you choose to reveal yourself.";
