import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router';

import { ConsigneScreen } from '../screens/ConsigneScreen';
import { ImagesScreen } from '../screens/ImagesScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { TextsScreen } from '../screens/TextsScreen';
import { WebDatingScreen } from '../screens/WebDatingScreen';

function Tasks(): React.JSX.Element {
  const navigate = useNavigate();
  return <TasksScreen onOpen={(slug) => { void navigate(`/images/${slug}`); }} />;
}

function Consigne(): React.JSX.Element {
  const { slug = '' } = useParams();
  return <ConsigneScreen slug={slug} />;
}

function Review(): React.JSX.Element {
  const { slug = '' } = useParams();
  return <ReviewScreen slug={slug} />;
}

export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/taches" replace />} />
      <Route path="/taches" element={<Tasks />} />
      <Route path="/images/:slug" element={<ImagesScreen />} />
      <Route path="/textes/:slug" element={<TextsScreen />} />
      <Route path="/consigne/:slug" element={<Consigne />} />
      <Route path="/revue/:slug" element={<Review />} />
      <Route path="/reglages" element={<SettingsScreen />} />
      <Route path="/dates-site" element={<WebDatingScreen />} />
    </Routes>
  );
}
