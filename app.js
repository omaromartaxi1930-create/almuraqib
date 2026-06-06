// 1. إعداد Firebase
const firebaseConfig = { 
    apiKey: "YOUR_API_KEY",
    projectId: "your-project-id",
    // ... باقي الإعدادات
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 2. دوال التنقل (التبديل بين الصفحات)
function switchAuthTab(tab) {
    document.getElementById('loginForm').style.display = (tab === 'login') ? 'block' : 'none';
    document.getElementById('registerForm').style.display = (tab === 'login') ? 'none' : 'block';
}

// 3. دالة التسجيل (التسجيل الحقيقي)
async function register() {
    const name = document.getElementById('regName').value;
    const phone = document.getElementById('regPhone').value;
    const pass = document.getElementById('regPass').value;
    
    try {
        await db.collection("users").doc(phone).set({ name, pass });
        alert("تم التسجيل يا " + name);
        switchAuthTab('login');
    } catch (e) {
        alert("خطأ في التسجيل: " + e.message);
    }
}
