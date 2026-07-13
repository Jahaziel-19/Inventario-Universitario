from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

class Command(BaseCommand):
    help = "Crea un usuario administrador por defecto solo si no existe."

    def add_arguments(self, parser):
        parser.add_argument("--username", default="admin")
        parser.add_argument("--password", default="admin123")
        parser.add_argument("--email", default="admin@example.com")

    def handle(self, *args, **options):
        user_model = get_user_model()
        username = options["username"]
        password = options["password"]
        email = options["email"]

        user, created = user_model.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )

        
        if created:
            user.set_password(password)
            user.save()
            self.stdout.write(self.style.SUCCESS(f"Administrador '{username}' creado exitosamente."))
        else:
            self.stdout.write(self.style.WARNING(f"El usuario '{username}' ya existe. No se realizaron cambios."))