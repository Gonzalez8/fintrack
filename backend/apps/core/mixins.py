class OwnedByUserMixin:
    """
    ViewSet mixin that automatically filters querysets to the authenticated user
    and injects owner on creation. Must be listed BEFORE ModelViewSet in MRO.
    """

    def get_queryset(self):
        return super().get_queryset().filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
