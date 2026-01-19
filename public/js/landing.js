// public/js/landing.js
document.addEventListener('DOMContentLoaded', () => {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        item.addEventListener('click', () => {
            const content = item.querySelector('.faq-content');
            const sign = item.querySelector('span');
            
            content.classList.toggle('hidden');
            sign.textContent = content.classList.contains('hidden') ? '+' : '-';
        });
    });
});