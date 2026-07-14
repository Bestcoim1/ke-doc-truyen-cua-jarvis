import { LoginForm } from "@/components/login-form";
import { Suspense } from "react";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

async function LoginContent({ searchParams }: PageProps) {
  const { next } = await searchParams;

  return <LoginForm next={next} />;
}

export default function Page({ searchParams }: PageProps) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense fallback={null}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
