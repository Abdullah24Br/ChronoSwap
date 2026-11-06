import { VerifyEmailClient } from "./verify-email-client";

export default async function VerifyEmailPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await props.searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;

  return <VerifyEmailClient initialToken={token} />;
}
