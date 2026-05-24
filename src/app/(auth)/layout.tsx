// the auth shell ... no workspace rail, just a centered card on the void.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-lunari-black px-6">
      {children}
    </div>
  );
}
