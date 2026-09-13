# Nestora Pulse v1

Multi-tenant SaaS inventory management system for Nestora Brands.

**Phase 1A - Infrastructure Ready**

This repository contains the complete Phase 1 infrastructure setup for Nestora Pulse v1:

- PostgreSQL database with 19-table schema (multi-tenant)
- - Next.js 14 frontend with React 18 and TypeScript
  - - Polling-based sync for Amazon, Walmart, Wayfair channels
    - - FIFO inventory tracking system
      - - Role-based access control (SUPER_ADMIN, ADMIN, EDITOR, VIEWER)
        - - Test fixtures with 2 tenants, 8 users, 6 warehouses, 20 orders
         
          - ## Getting Started
         
          - See PHASE-1-SETUP-GUIDE.md for detailed setup instructions.
