import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Home, Search } from "lucide-react"

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <Card className="max-w-md w-full">
                <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                        <div className="text-8xl font-bold text-primary">404</div>

                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold">Page Not Found</h1>
                            <p className="text-muted-foreground">
                                The page you're looking for doesn't exist or has been moved.
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-4">
                            <Button asChild className="flex-1">
                                <Link href="/">
                                    <Home className="h-4 w-4 mr-2" />
                                    Go Home
                                </Link>
                            </Button>
                            <Button asChild variant="outline" className="flex-1">
                                <Link href="/search">
                                    <Search className="h-4 w-4 mr-2" />
                                    Search Properties
                                </Link>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
