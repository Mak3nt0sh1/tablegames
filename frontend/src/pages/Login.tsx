import { Link } from "react-router-dom";

export default function Login() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white text-center mb-6">Вход в аккаунт</h2>
      
      <form className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
          <input 
            type="email" 
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="player@mail.com"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Пароль</label>
          <input 
            type="password" 
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="••••••••"
          />
        </div>

        <button 
          type="button" // Пока что type="button", чтобы форма не отправлялась по-настоящему
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl px-4 py-3 mt-4 transition-colors"
        >
          Войти
        </button>
      </form>

      <p className="text-center text-gray-400 mt-6">
        Нет аккаунта? <Link to="/register" className="text-indigo-400 hover:text-indigo-300">Зарегистрироваться</Link>
      </p>
    </div>
  );
}
