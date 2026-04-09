import { Outlet } from 'react-router-dom'

const CommonLayout = () => {
	return (
		<main className="min-h-screen">
			<Outlet />
		</main>
	)
}

export default CommonLayout
