interface SearchBarProps {
    value: string
    onChange: (value: string) => void
    placeholder: string
}

export default function SearchBar({ value, onChange, placeholder }: SearchBarProps) {
    return (
        <div className="flex flex-col sm:flex-row gap-3">
            <input
                type="text"
                className="flex-1 h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none bg-white"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            <button className="h-12 px-6 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition whitespace-nowrap">
                🔍 chercher
            </button>
        </div>
    )
}