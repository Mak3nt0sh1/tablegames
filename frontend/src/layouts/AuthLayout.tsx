import { Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen bg-gray-950 items-center justify-center p-4">
      {/* Контейнер для формы, Outlet подставит сюда Login или Register */}
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl">
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center font-bold text-white text-2xl">T</div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
