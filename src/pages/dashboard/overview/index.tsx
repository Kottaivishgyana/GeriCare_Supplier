import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuthStore, API_BASE } from '@/stores/useAuthStore'

// Constants
const SIDEBAR_SELECTORS = ['.sidebar-column', '.web-sidebar', '.sidebar-items']
const CONTENT_SELECTORS = ['main', '.main-content']
const SKIP_ROUTES = ['/', '/login']

// Types
interface ExtractedContent {
  content: string
  styles: string
}

interface SidebarItem {
  href: string
  text: string
  isActive: boolean
}

// Utility Functions
const removeScripts = (element: HTMLElement): void => {
  element.querySelectorAll('script').forEach((script) => script.remove())
}

const normalizePath = (path: string): string => {
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path
}

const extractSidebarItems = (html: string): SidebarItem[] => {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Find sidebar-items or fallback to list-unstyled
    let container: Element | null = null
    for (const selector of SIDEBAR_SELECTORS) {
      container = doc.querySelector(selector)
      if (container) break
    }

    if (!container) {
      // Fallback: find all list-unstyled
      const listElements = doc.querySelectorAll('.list-unstyled')
      if (listElements.length === 0) return []
      container = listElements[0].parentElement
    }

    if (!container) return []

    const items: SidebarItem[] = []
    const links = container.querySelectorAll<HTMLAnchorElement>('.sidebar-item a, a')

    links.forEach((link) => {
      const href = link.getAttribute('href')
      const text = link.textContent?.trim() || ''
      const isActive = link.classList.contains('active')

      // Filter out Newsletter link
      if (href && text && !text.toLowerCase().includes('newsletter') && !href.includes('/newsletters')) {
        items.push({
          href,
          text,
          isActive,
        })
      }
    })

    return items
  } catch (error) {
    console.error('Error extracting sidebar items:', error)
    return []
  }
}

const sanitizeStyles = (styleContent: string): string => {
  return styleContent
    .replace(/transform\s*:[^;]+;?/gi, '')
    .replace(/-webkit-transform\s*:[^;]+;?/gi, '')
    .replace(/-moz-transform\s*:[^;]+;?/gi, '')
    .replace(/-ms-transform\s*:[^;]+;?/gi, '')
    .replace(/-o-transform\s*:[^;]+;?/gi, '')
    .replace(/zoom\s*:[^;]+;?/gi, '')
    .replace(/scale\([^)]+\)/gi, 'scale(1)')
}

const fixRelativeUrl = (url: string): string => {
  if (url.startsWith('http') || url.startsWith('data:')) {
    return url
  }
  return `${API_BASE}${url.startsWith('/') ? url : '/' + url}`
}

const extractStylesAndContent = (html: string): ExtractedContent => {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Extract and sanitize styles
    let styles = ''
    doc.querySelectorAll('style').forEach((style) => {
      styles += sanitizeStyles(style.innerHTML) + '\n'
    })

    // Extract external stylesheets
    doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = link.getAttribute('href')
      if (href) {
        styles += `@import url('${fixRelativeUrl(href)}');\n`
      }
    })

    // Extract content
    const body = doc.body || doc.documentElement
    const mainContent =
      CONTENT_SELECTORS.map((sel) => body.querySelector(sel)).find(Boolean) || body

    const contentClone = mainContent.cloneNode(true) as HTMLElement
    removeScripts(contentClone)

    // Fix relative URLs in images
    contentClone.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src')
      if (src) {
        img.setAttribute('src', fixRelativeUrl(src))
      }
    })

    // Fix relative URLs in inline styles
    contentClone.querySelectorAll('[style]').forEach((element) => {
      const style = element.getAttribute('style') || ''
      const fixedStyle = style.replace(/url\(['"]?([^'")]+)['"]?\)/g, (_match, url) => {
        return `url('${fixRelativeUrl(url)}')`
      })
      element.setAttribute('style', fixedStyle)
    })

    return {
      content: contentClone.innerHTML,
      styles,
    }
  } catch (error) {
    console.error('Error extracting styles and content:', error)
    return { content: html, styles: '' }
  }
}

const fetchWithAuth = async (url: string, token: string): Promise<Response> => {
  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    credentials: 'include',
  })
}

const isInternalLink = (url: URL): boolean => {
  try {
    return url.origin === new URL(API_BASE).origin || url.pathname.startsWith('/')
  } catch {
    return false
  }
}

const matchesPath = (linkPath: string, currentPath: string): boolean => {
  const normalizedLink = normalizePath(linkPath)
  const normalizedCurrent = normalizePath(currentPath)
  return (
    linkPath === currentPath ||
    linkPath === `${currentPath}/` ||
    currentPath === `${linkPath}/` ||
    normalizedLink === normalizedCurrent
  )
}


export default function DashboardPage() {
  const { user, homePage, token, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([])
  const [mainContent, setMainContent] = useState<string>('')
  const [contentStyles, setContentStyles] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isContentLoading, setIsContentLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contentRef = useRef<HTMLDivElement>(null)

  // Fetch page content
  const fetchPageContent = useCallback(
    async (url: string) => {
      if (!token) {
        setError('No authentication token available')
        return
      }

      try {
        setIsContentLoading(true)
        setError(null)

        const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`
        const response = await fetchWithAuth(fullUrl, token)

        if (response.ok) {
          const html = await response.text()
          const { content, styles } = extractStylesAndContent(html)
          
          // Small delay to ensure smooth transition
          await new Promise((resolve) => setTimeout(resolve, 50))
          
          setContentStyles(styles)
          // Set content after styles to prevent flicker
          setTimeout(() => {
            setMainContent(content)
            setIsContentLoading(false)
          }, 100)
        } else {
          setError(`Failed to load page: ${response.status} ${response.statusText}`)
          setIsContentLoading(false)
        }
      } catch (error) {
        console.error('Failed to fetch page content:', error)
        setError('Failed to load page content. Please try again.')
        setIsContentLoading(false)
      }
    },
    [token]
  )

  // Handle sidebar link click
  const handleSidebarClick = useCallback(
    (href: string, e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault()
      navigate(href, { replace: false })
    },
    [navigate]
  )

  // Handle content area link clicks
  const handleContentClick = useCallback(
    (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>('a')
      if (!anchor?.href) return

      try {
        const url = new URL(anchor.href)
        if (isInternalLink(url)) {
          e.preventDefault()
          e.stopPropagation()
          navigate(url.pathname + url.search + url.hash, { replace: false })
        }
      } catch {
        // Invalid URL, let browser handle it
      }
    },
    [navigate]
  )

  // Fetch sidebar on mount
  useEffect(() => {
    const fetchSidebar = async () => {
      if (!homePage || !token) {
        setError(homePage ? 'No authentication token available' : 'No home page configured')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        const response = await fetchWithAuth(`${API_BASE}${homePage}`, token)

        if (response.ok) {
          const html = await response.text()
          setSidebarItems(extractSidebarItems(html))
        } else {
          setError(`Failed to load page: ${response.status} ${response.statusText}`)
        }
      } catch (error) {
        console.error('Failed to fetch dashboard:', error)
        setError('Failed to load dashboard content. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSidebar()
  }, [homePage, token])

  // Navigate to home page on initial load
  useEffect(() => {
    if (homePage && location.pathname === '/' && token) {
      navigate(homePage, { replace: true })
    }
  }, [homePage, location.pathname, token, navigate])

  // Load content based on route
  useEffect(() => {
    const currentPath = location.pathname + location.search + location.hash

    if (SKIP_ROUTES.includes(currentPath) || !token) {
      return
    }

    fetchPageContent(currentPath)
  }, [location.pathname, location.search, location.hash, token, fetchPageContent])

  // Get current path for active link detection
  const currentPath = location.pathname + location.search + location.hash


  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    content.addEventListener('click', handleContentClick)
    return () => content.removeEventListener('click', handleContentClick)
  }, [mainContent, handleContentClick])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Prevent header glitches and ensure sidebar active state */}
      <style>{`
        header,
        header *,
        header h1,
        header span,
        header button {
          transform: none !important;
          zoom: 1 !important;
          scale: 1 !important;
          -webkit-transform: none !important;
          font-size: inherit !important;
        }
        .sidebar-item a {
          display: block !important;
          text-decoration: none !important;
          transition: background-color 0.2s ease, color 0.2s ease !important;
        }
        .sidebar-item a[style*="background-color"] {
          color: white !important;
        }
        main {
          will-change: contents;
        }
        main > div {
          transition: opacity 0.3s ease-in-out;
        }
      `}</style>
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 [transform:translateZ(0)]">
        <header className="border-b border-border bg-background">
          <div className="h-14 flex items-center px-4 w-full">
            <div className="flex-1 flex items-center gap-4 min-w-0">
              <h1 className="text-lg leading-7 font-semibold m-0 p-0 text-foreground [transform:none] [zoom:1]">
                GeriCare Supplier
              </h1>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              {user?.full_name && (
                <span className="text-sm leading-5 text-muted-foreground whitespace-nowrap [transform:none] [zoom:1]">
                  Welcome, {user.full_name}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 flex-shrink-0 [transform:none] [zoom:1]"
              >
                Logout
              </Button>
            </div>
          </div>
        </header>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 pt-14 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center w-full">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center w-full">
            <div className="text-destructive">{error}</div>
          </div>
        ) : (
          <>
            {/* Sidebar */}
            {sidebarItems.length > 0 && (
              <aside className="w-64 border-r bg-muted/40 flex-shrink-0 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto p-4">
                  <nav className="space-y-1">
                    {sidebarItems.map((item, index) => {
                      const isActive = matchesPath(item.href, currentPath) || item.isActive
                      return (
                        <div key={`${item.href}-${index}`} className="sidebar-item">
                          <a
                            href={item.href}
                            onClick={(e) => handleSidebarClick(item.href, e)}
                            className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
                              isActive
                                ? 'bg-blue-500 text-white !important'
                                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                            }`}
                            style={
                              isActive
                                ? {
                                    backgroundColor: 'rgb(59 130 246)',
                                    color: 'white',
                                  }
                                : undefined
                            }
                          >
                            {item.text}
                          </a>
                        </div>
                      )
                    })}
                  </nav>
                </div>
              </aside>
            )}

            {/* Content Area */}
            <main className="flex-1 overflow-hidden flex flex-col relative">
              {/* Loading overlay with smooth transition */}
              {isContentLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10 transition-opacity duration-300 [transform:translateZ(0)]">
                  <div className="text-muted-foreground">Loading content...</div>
                </div>
              )}
              
              {/* Content with smooth fade transition */}
              <div
                className={`h-full overflow-y-auto transition-opacity duration-300 [transform:translateZ(0)] ${
                  isContentLoading && mainContent ? 'opacity-50' : 'opacity-100'
                }`}
              >
                {contentStyles && <style dangerouslySetInnerHTML={{ __html: contentStyles }} />}
                {mainContent ? (
                  <div
                    ref={contentRef}
                    className="p-6 [transform:translateZ(0)]"
                    dangerouslySetInnerHTML={{ __html: mainContent }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Select an item from the sidebar to view content</p>
                  </div>
                )}
              </div>
            </main>
          </>
        )}
      </div>
    </div>
  )
}
