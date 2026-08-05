import Link from 'next/link'

type NavItem = 'dashboard' | 'patients' | 'tests' | 'reports' | 'settings'

interface NavbarProps {
    active: NavItem
}

export default function Navbar({ active }: NavbarProps) {
    const links: { href: string; label: string; key: NavItem }[] = [
        { href: '/dashboard', label: '🏠 Dashboard', key: 'dashboard' },
        { href: '/patients', label: '👥 Patients', key: 'patients' },
        { href: '/tests', label: '📋 Tests', key: 'tests' },
        { href: '#', label: '📊 Rapports', key: 'reports' },
        { href: '#', label: '⚙️ Paramètres', key: 'settings' },
    ]

    return (
        <nav className="flex gap-1 px-4 sm:px-8 py-3 bg-white border-b border-gray-200 overflow-x-auto">
            {links.map((link) => (
                <Link
                    key={link.key}
                    href={link.href}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                        active === link.key
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                >
                    {link.label}
                </Link>
            ))}
        </nav>
    )
}