import { redirect } from 'next/navigation'

// Root redirects to the chats list.
// Middleware handles auth — unauthenticated users are sent to /login before this runs.
export default function RootPage() {
  redirect('/chats')
}
