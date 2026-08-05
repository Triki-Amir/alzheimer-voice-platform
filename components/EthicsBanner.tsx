export default function EthicsBanner() {
    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-gray-100 rounded-xl">
            <span className="text-2xl">🔒</span>
            <div className="text-sm text-gray-500">
                <strong className="text-gray-700 block sm:inline">
                    Toutes les données sont chiffrées et pseudonymisées
                </strong>
                <span className="sm:ml-1">conformément à la réglementation INPDP</span>
                <a href="#" className="text-blue-600 font-medium hover:underline block sm:inline sm:ml-2">
                    En savoir plus →
                </a>
            </div>
        </div>
    )
}