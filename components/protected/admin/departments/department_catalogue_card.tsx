"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { 
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePathname, useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";

import { EllipsisVertical, Users, UserCog } from "lucide-react";
import type { Department } from "./department_catalogues"

export function DepartmentCatalogueCard({ department }: { department: Department }) {
    const router = useRouter();
    const pathname = usePathname();
    const isClosed = department.status === 'closed';
    const detailsHref = `${pathname}/${department.id}`;

    return(
        <Card 
            className={`cursor-pointer transition-colors hover:bg-muted/50 ${isClosed ? 'opacity-70' : ''}`}
            onClick={() => { 
                router.push(detailsHref)
            }}
        >  
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                    <CardTitle>{department.name}</CardTitle>
                    {isClosed && (
                        <Badge variant="secondary" className="text-xs">Closed</Badge>
                    )}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger render={
                            <Button variant="ghost" size="icon">
                                <EllipsisVertical className="h-4 w-4" />
                            </Button>
                        }/>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(detailsHref)}>
                                View Details
                            </DropdownMenuItem>
                            {!isClosed && (
                                <>
                                    <DropdownMenuItem onClick={() => router.push(`${detailsHref}?action=edit`)}>
                                        Edit Department
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive" onClick={() => router.push(`${detailsHref}?action=close`)}>
                                        Close Department
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-2 mt-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>Total Members: {department.totalMembers}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <UserCog className="h-4 w-4" />
                        <span>Managers: {department.managersCount}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-4 pt-4 border-t flex flex-col gap-1">
                        <p>Created on {formatDate(department.created_at)}</p>
                        <p>Created by: {department.creatorName || department.created_by}</p>
                        {department.last_updated && (
                            <>
                                <p className="mt-1">Last updated on {formatDate(department.last_updated)}</p>
                                <p>Updated by: {department.updaterName || department.updated_by}</p>
                            </>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
