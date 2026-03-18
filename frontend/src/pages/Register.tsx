import { Link } from "react-router-dom";

export default function Register() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white text-center mb-6">Регистрация</h2>
      
      <form className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Никнейм</label>
          <input 
            type="text" 
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
            placeholder="SuperPlayer"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
          <input 
            type="email" 
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
            placeholder="player@mail.com"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Пароль</label>
          <input 
            type="password" 
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
            placeholder="Создайте надежный пароль"
          />
        </div>

        <button 
          type="button" 
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl px-4 py-3 mt-4 transition-colors"
        >
          Создать аккаунт
        </button>
      </form>

      <p className="text-center text-gray-400 mt-6">
        Уже есть аккаунт? <Link to="/login" className="text-indigo-400 hover:text-indigo-300">Войти</Link>
      </p>
    </div>
  );
}
