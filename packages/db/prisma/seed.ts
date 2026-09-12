import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { prisma } from '../index';

// Phase 2 placeholder seed — original sample copy (not client content).
// Idempotent: every row is upserted by its unique field, so re-running
// `prisma db seed` never duplicates rows. Real content arrives in Phase 0/10.
async function main() {
  const categories = await Promise.all(
    [
      {
        slug: 'production-lines',
        nameAr: 'خطوط الإنتاج',
        nameEn: 'Production Lines',
        descriptionAr: 'خطوط إنتاج كاملة لقطاع الصناعات الغذائية.',
        descriptionEn: 'Complete production lines for the food industry.',
        image: '/images/seed/category-production-lines.jpg',
      },
      {
        slug: 'packaging-machines',
        nameAr: 'آلات التغليف',
        nameEn: 'Packaging Machines',
        descriptionAr: 'آلات تغليف وتعبئة للمنتجات الغذائية.',
        descriptionEn: 'Packaging and filling machines for food products.',
        image: '/images/seed/category-packaging.jpg',
      },
      {
        slug: 'conveying-systems',
        nameAr: 'أنظمة النقل',
        nameEn: 'Conveying Systems',
        descriptionAr: 'سيور وأنظمة نقل للمواد والمنتجات.',
        descriptionEn: 'Belts and conveying systems for materials.',
        image: '/images/seed/category-conveying.jpg',
      },
    ].map((c) =>
      prisma.machineCategory.upsert({
        where: { slug: c.slug },
        update: c,
        create: c,
      })
    )
  );

  const bySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

  const machines = await Promise.all(
    [
      {
        slug: 'colina-pro-1000',
        nameAr: 'خط كولينا برو 1000',
        nameEn: 'Colina Pro 1000',
        categoryId: bySlug['production-lines'].id,
        shortDescriptionAr: 'خط إنتاج متكامل بسعة متوسطة.',
        shortDescriptionEn: 'Integrated mid-capacity production line.',
        descriptionAr: 'وصف تفصيلي مؤقت لخط الإنتاج.',
        descriptionEn: 'Temporary detailed description of the line.',
        specsAr: 'السعة: 1000 وحدة/ساعة.',
        specsEn: 'Capacity: 1000 units/hour.',
        datasheetUrl: '/datasheets/seed/colina-pro-1000.pdf',
      },
      {
        slug: 'colina-pro-2000',
        nameAr: 'خط كولينا برو 2000',
        nameEn: 'Colina Pro 2000',
        categoryId: bySlug['production-lines'].id,
        shortDescriptionAr: 'خط إنتاج عالي السعة.',
        shortDescriptionEn: 'High-capacity production line.',
        descriptionAr: 'وصف تفصيلي مؤقت لخط الإنتاج.',
        descriptionEn: 'Temporary detailed description of the line.',
        specsAr: 'السعة: 2000 وحدة/ساعة.',
        specsEn: 'Capacity: 2000 units/hour.',
        datasheetUrl: null,
      },
      {
        slug: 'colina-pack-s',
        nameAr: 'آلة التغليف S',
        nameEn: 'Colina Pack S',
        categoryId: bySlug['packaging-machines'].id,
        shortDescriptionAr: 'آلة تغليف مدمجة.',
        shortDescriptionEn: 'Compact packaging machine.',
        descriptionAr: 'وصف تفصيلي مؤقت لآلة التغليف.',
        descriptionEn: 'Temporary detailed description of the packer.',
        specsAr: 'السرعة: 60 عبوة/دقيقة.',
        specsEn: 'Speed: 60 packs/minute.',
        datasheetUrl: null,
      },
      {
        slug: 'colina-belt-500',
        nameAr: 'سير النقل 500',
        nameEn: 'Colina Belt 500',
        categoryId: bySlug['conveying-systems'].id,
        shortDescriptionAr: 'سير نقل بعرض 500 ملم.',
        shortDescriptionEn: '500 mm wide conveyor belt.',
        descriptionAr: 'وصف تفصيلي مؤقت لسير النقل.',
        descriptionEn: 'Temporary detailed description of the belt.',
        specsAr: 'العرض: 500 ملم.',
        specsEn: 'Width: 500 mm.',
        datasheetUrl: null,
      },
    ].map((m) =>
      prisma.machine.upsert({
        where: { slug: m.slug },
        update: m,
        create: m,
      })
    )
  );

  // Gallery images (position = display order, lowest first).
  for (const machine of machines) {
    for (const position of [0, 1]) {
      await prisma.machineImage.upsert({
        where: {
          // No unique key on (machineId, position), so delete + recreate
          // is avoided by matching on the deterministic seed URL instead.
          id: `seed-${machine.slug}-${position}`,
        },
        update: {},
        create: {
          id: `seed-${machine.slug}-${position}`,
          machineId: machine.id,
          url: `/images/seed/${machine.slug}-${position}.jpg`,
          position,
        },
      });
    }
  }

  // Related machines (directional links — seed both ways for a symmetric
  // pair). `set` (not `connect`) keeps re-runs idempotent.
  const pro1000 = machines.find((m) => m.slug === 'colina-pro-1000');
  const pro2000 = machines.find((m) => m.slug === 'colina-pro-2000');
  if (pro1000 && pro2000) {
    await prisma.machine.update({
      where: { id: pro1000.id },
      data: { relatedMachines: { set: [{ id: pro2000.id }] } },
    });
    await prisma.machine.update({
      where: { id: pro2000.id },
      data: { relatedMachines: { set: [{ id: pro1000.id }] } },
    });
  }

  await Promise.all(
    [
      {
        slug: 'preventive-maintenance',
        titleAr: 'الصيانة الوقائية',
        titleEn: 'Preventive Maintenance',
        descriptionAr: 'برامج صيانة دورية لخطوط الإنتاج.',
        descriptionEn: 'Scheduled maintenance programs for lines.',
        scopeAr: 'فحص دوري، تشحيم، معايرة.',
        scopeEn: 'Periodic inspection, lubrication, calibration.',
        icon: 'wrench',
      },
      {
        slug: 'emergency-repair',
        titleAr: 'الإصلاح الطارئ',
        titleEn: 'Emergency Repair',
        descriptionAr: 'تدخل سريع عند الأعطال.',
        descriptionEn: 'Rapid response to breakdowns.',
        scopeAr: 'تشخيص وإصلاح خلال 48 ساعة.',
        scopeEn: 'Diagnosis and repair within 48 hours.',
        icon: 'siren',
      },
      {
        slug: 'spare-parts',
        titleAr: 'قطع الغيار',
        titleEn: 'Spare Parts',
        descriptionAr: 'توفير قطع الغيار الأصلية.',
        descriptionEn: 'Supply of genuine spare parts.',
        scopeAr: 'كتالوج قطع الغيار والتوريد.',
        scopeEn: 'Parts catalog and supply.',
        icon: 'cog',
      },
    ].map((s) =>
      prisma.maintenanceService.upsert({
        where: { slug: s.slug },
        update: s,
        create: s,
      })
    )
  );

  await Promise.all(
    ['seed-partner-a', 'seed-partner-b', 'seed-partner-c'].map((name) =>
      prisma.partner.upsert({
        where: { id: name },
        update: {},
        create: {
          id: name,
          nameAr: `شريك تجريبي ${name.slice(-1).toUpperCase()}`,
          nameEn: `Seed Partner ${name.slice(-1).toUpperCase()}`,
          logo: `/images/seed/${name}.png`,
        },
      })
    )
  );

  await Promise.all(
    [
      {
        id: 'seed-agent-cairo',
        countryAr: 'مصر',
        countryEn: 'Egypt',
        cityAr: 'القاهرة',
        cityEn: 'Cairo',
        phone: '+20 2 0000 0000',
        email: 'cairo@example.com',
      },
      {
        id: 'seed-agent-riyadh',
        countryAr: 'السعودية',
        countryEn: 'Saudi Arabia',
        cityAr: 'الرياض',
        cityEn: 'Riyadh',
        phone: '+966 11 000 0000',
        email: 'riyadh@example.com',
      },
    ].map((a) =>
      prisma.agent.upsert({
        where: { id: a.id },
        update: a,
        create: a,
      })
    )
  );

  await Promise.all(
    [
      {
        slug: 'seed-news-launch',
        titleAr: 'خبر تجريبي: الإطلاق',
        titleEn: 'Seed News: Launch',
        bodyAr: 'نص تجريبي لخبر الإطلاق.',
        bodyEn: 'Seed body for the launch post.',
        image: '/images/seed/news-launch.jpg',
      },
      {
        slug: 'seed-news-service',
        titleAr: 'خبر تجريبي: الصيانة',
        titleEn: 'Seed News: Service',
        bodyAr: 'نص تجريبي لخبر الصيانة.',
        bodyEn: 'Seed body for the service post.',
        image: '/images/seed/news-service.jpg',
      },
    ].map((n) =>
      prisma.newsPost.upsert({
        where: { slug: n.slug },
        update: n,
        create: n,
      })
    )
  );

  await prisma.contactMessage.upsert({
    where: { id: 'seed-contact-1' },
    update: {},
    create: {
      id: 'seed-contact-1',
      name: 'Seed Contact',
      email: 'contact@example.com',
      phone: '+20 100 000 0000',
      message: 'Seed contact message.',
      status: 'NEW',
    },
  });

  await prisma.maintenanceRequest.upsert({
    where: { id: 'seed-maint-1' },
    update: {},
    create: {
      id: 'seed-maint-1',
      name: 'Seed Requester',
      company: 'Seed Foods Co.',
      phone: '+20 100 000 0001',
      email: 'requester@example.com',
      machineModel: 'Colina Pro 1000',
      message: 'Seed maintenance request.',
      status: 'NEW',
    },
  });

  // Seed admin password: read from the environment so no plaintext —
  // real or fake — is ever committed. Without SEED_ADMIN_PASSWORD a
  // random one is generated, hashed with argon2id, and printed ONCE
  // (never stored). Re-seeding resets the password and prints again.
  const seedPassword =
    process.env.SEED_ADMIN_PASSWORD ?? randomBytes(24).toString('base64url');
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(
      'SEED_ADMIN_PASSWORD is not set — generated random admin password (shown once, never stored):'
    );
    console.log(`admin@example.com / ${seedPassword}`);
  }
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@example.com' },
    update: { passwordHash: await argon2.hash(seedPassword) },
    create: {
      email: 'admin@example.com',
      passwordHash: await argon2.hash(seedPassword),
      role: 'SUPER_ADMIN',
    },
  });

  await prisma.auditLog.upsert({
    where: { id: 'seed-audit-1' },
    update: {},
    create: {
      id: 'seed-audit-1',
      adminUserId: admin.id,
      action: 'SEED',
      entity: 'database',
    },
  });

  console.log('Seed completed.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
