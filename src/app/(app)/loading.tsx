import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-11 w-72" />
        <Skeleton className="h-5 w-[520px] max-w-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-4 h-10 w-24" />
            <Skeleton className="mt-3 h-4 w-full" />
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="p-6">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full rounded-[24px]" />
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <Skeleton className="h-6 w-40" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-[22px]" />
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <Skeleton className="h-5 w-32" />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-[22px]" />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
